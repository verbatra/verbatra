import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { AdapterRegistry } from "@verbatra/format-adapters";
import { describe, expect, it } from "vitest";
import type { LoadedConfig } from "../config/load-config.js";
import type { VerbatraConfig } from "../config/schema.js";
import {
  baseConfig,
  makeFakeFs,
  makeTempDir,
  realDiskReads,
  writeJsonFile,
} from "../test-support.js";
import { type DoctorResult, doctor } from "./doctor.js";
import { doctorResultSchema } from "./doctor-schema.js";

async function projectWith(limits?: string, source = { a: "A", b: "B" }): Promise<string> {
  const dir = await makeTempDir();
  await mkdir(join(dir, "locales"));
  await writeJsonFile(join(dir, "locales", "en.json"), source);
  if (limits !== undefined) {
    await writeFile(join(dir, "verbatra.limits.json"), limits, "utf8");
  }
  return dir;
}

async function limitsCheck(
  dir: string,
  config: VerbatraConfig = baseConfig(),
): Promise<{ check: DoctorResult["checks"][number] | undefined; result: DoctorResult }> {
  const loaded: LoadedConfig = {
    config,
    source: { kind: "override" },
    glossary: { source: "none" },
  };
  const result = await doctor({ cwd: dir }, { loadConfig: async () => loaded });
  return { check: result.checks.find((entry) => entry.id === "limits"), result };
}

const document = (maxLength: Record<string, number>): string =>
  JSON.stringify({ version: 1, maxLength });

describe("doctor: the limits check", () => {
  it("passes when there is no limits file", async () => {
    const { check } = await limitsCheck(await projectWith());

    expect(check).toEqual({
      id: "limits",
      title: "Length limits",
      status: "pass",
      detail: "verbatra.limits.json holds no limits.",
    });
  });

  it("passes and counts limits that all name keys of the source", async () => {
    const { check } = await limitsCheck(await projectWith(document({ a: 5, b: 6 })));

    expect(check).toMatchObject({
      status: "pass",
      detail: "verbatra.limits.json holds 2 limits, each for a key in the source.",
    });
  });

  it("warns on an unusable file and says what that costs", async () => {
    const { check } = await limitsCheck(await projectWith("{ nope"));

    expect(check?.status).toBe("warn");
    expect(check?.detail).toContain("verbatra.limits.json is not valid JSON.");
    expect(check?.detail).toContain("a limit cannot be set until it is fixed");
  });

  it("tells a directory at the path to be replaced or removed, not to fix its permissions", async () => {
    const dir = await projectWith();
    await mkdir(join(dir, "verbatra.limits.json"));

    const { check } = await limitsCheck(dir);

    expect(check?.status).toBe("warn");
    expect(check?.detail).toContain("verbatra.limits.json is not a regular file.");
    expect(check?.detail).toContain(
      "Replace verbatra.limits.json with a regular file, or remove it.",
    );
    expect(check?.detail).not.toMatch(/permission/i);
  });

  it("sends a file the process may not read to its permissions, not to delete", async () => {
    const dir = await projectWith();
    const loaded: LoadedConfig = {
      config: baseConfig(),
      source: { kind: "override" },
      glossary: { source: "none" },
    };
    const disk = realDiskReads();
    const fs = makeFakeFs({
      ...disk,
      readBytesBounded: async (path, maxBytes) =>
        path.endsWith("verbatra.limits.json")
          ? { kind: "missing", unreadable: true }
          : disk.readBytesBounded(path, maxBytes),
    });

    const result = await doctor({ cwd: dir }, { fs, loadConfig: async () => loaded });

    const check = result.checks.find((entry) => entry.id === "limits");
    expect(check?.status).toBe("warn");
    expect(check?.detail).toContain("a permissions problem");
    expect(check?.detail).toContain("Check the permissions of verbatra.limits.json.");
    expect(check?.detail).not.toMatch(/delete|restore|replace/i);
  });

  it("warns on a newer version by name", async () => {
    const { check } = await limitsCheck(await projectWith('{"version":2,"maxLength":{}}'));

    expect(check?.status).toBe("warn");
    expect(check?.detail).toContain("declares version 2");
  });

  it("warns and names a key the source no longer has", async () => {
    const { check } = await limitsCheck(await projectWith(document({ a: 5, gone: 6 })));

    expect(check).toMatchObject({
      status: "warn",
      detail: 'verbatra.limits.json holds 2 limits. 1 key is not in the source: "gone".',
    });
  });

  it("warns and names a limit the config overrides", async () => {
    const { check } = await limitsCheck(
      await projectWith(document({ a: 5, b: 6 })),
      baseConfig({ maxLength: { a: 9 } }),
    );

    expect(check).toMatchObject({
      status: "warn",
      detail:
        'verbatra.limits.json holds 2 limits. 1 limit is overridden by the config\'s maxLength: "a".',
    });
  });

  it("lists at most five keys and counts the rest", async () => {
    const limits = Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`gone${i}`, 5]));
    const { check } = await limitsCheck(await projectWith(document(limits)));

    expect(check?.detail).toContain(
      '8 keys are not in the source: "gone0", "gone1", "gone2", "gone3", "gone4" and 3 more.',
    );
  });

  it("says the keys were not checked when the source cannot be read", async () => {
    const dir = await makeTempDir();
    await writeFile(join(dir, "verbatra.limits.json"), document({ a: 5 }), "utf8");

    const { check } = await limitsCheck(dir);

    expect(check?.status).toBe("warn");
    expect(check?.detail).toContain("Its keys were not checked against the source:");
  });

  it("says the keys were not checked when the format has no adapter", async () => {
    const dir = await projectWith(document({ a: 5 }));

    const loaded: LoadedConfig = {
      config: baseConfig(),
      source: { kind: "override" },
      glossary: { source: "none" },
    };

    const result = await doctor(
      { cwd: dir },
      { adapterRegistry: new AdapterRegistry(), loadConfig: async () => loaded },
    );

    const check = result.checks.find((entry) => entry.id === "limits");
    expect(check?.status).toBe("warn");
    expect(check?.detail).toContain("the format has no adapter");
  });

  it("is skipped like the other config-dependent checks when the config cannot load", async () => {
    const dir = await projectWith();

    const result = await doctor({ cwd: dir });

    expect(result.checks.find((entry) => entry.id === "limits")?.status).toBe("skipped");
  });

  it("produces a result the published doctor schema accepts", async () => {
    const { result } = await limitsCheck(await projectWith("{ nope"));

    expect(doctorResultSchema.safeParse(result).success).toBe(true);
  });
});
