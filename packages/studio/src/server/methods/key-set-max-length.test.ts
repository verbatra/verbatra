import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createDefaultRegistry, type SdkFs } from "@verbatra/sdk";
import { describe, expect, it } from "vitest";
import type { RpcHandlerDeps } from "../rpc.js";
import { type FixtureProject, makeFixtureProject } from "../test-support.js";
import { CONFIG_KEY_REFUSAL, keySetMaxLengthHandler } from "./key-set-max-length.js";

function deps(project: FixtureProject): RpcHandlerDeps {
  return {
    config: { config: project.config, source: { kind: "override" }, glossary: { source: "none" } },
    projectRoot: project.root,
  };
}

function limitsPath(project: FixtureProject): string {
  return join(project.root, "verbatra.limits.json");
}

async function limitsOnDisk(project: FixtureProject): Promise<unknown> {
  return JSON.parse(await readFile(limitsPath(project), "utf8"));
}

describe("keySetMaxLengthHandler", () => {
  it("sets, changes and removes a limit in the limits file", async () => {
    const project = await makeFixtureProject({}, { greeting: "hello", bye: "bye" });
    try {
      expect(
        await keySetMaxLengthHandler({ key: "greeting", maxLength: 12 }, deps(project)),
      ).toEqual({ key: "greeting", maxLength: 12, changed: true });
      await keySetMaxLengthHandler({ key: "greeting", maxLength: 20 }, deps(project));
      await keySetMaxLengthHandler({ key: "bye", maxLength: 3 }, deps(project));
      expect(await limitsOnDisk(project)).toEqual({
        version: 1,
        maxLength: { bye: 3, greeting: 20 },
      });

      const removed = await keySetMaxLengthHandler(
        { key: "greeting", maxLength: null },
        deps(project),
      );

      expect(removed).toEqual({ key: "greeting", maxLength: null, changed: true });
      expect(await limitsOnDisk(project)).toEqual({ version: 1, maxLength: { bye: 3 } });
    } finally {
      await project.cleanup();
    }
  });

  it("refuses a key the config sets itself, naming the start-time snapshot, and writes nothing", async () => {
    const project = await makeFixtureProject({ maxLength: { greeting: 5 } });
    try {
      await expect(
        keySetMaxLengthHandler({ key: "greeting", maxLength: 12 }, deps(project)),
      ).rejects.toMatchObject({ name: "SdkError", code: "LENGTH_LIMIT_INVALID" });
      await expect(
        keySetMaxLengthHandler({ key: "greeting", maxLength: 12 }, deps(project)),
      ).rejects.toThrow(/started/);
      await expect(readFile(limitsPath(project), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await project.cleanup();
    }
  });

  it("lets a shadowed limits-file entry of a config-set key be removed, as the sdk does", async () => {
    const project = await makeFixtureProject({ maxLength: { greeting: 5 } });
    await writeFile(
      limitsPath(project),
      `${JSON.stringify({ version: 1, maxLength: { greeting: 9 } })}\n`,
    );
    try {
      const result = await keySetMaxLengthHandler(
        { key: "greeting", maxLength: null },
        deps(project),
      );

      expect(result).toEqual({ key: "greeting", maxLength: null, changed: true });
      expect(await limitsOnDisk(project)).toEqual({ version: 1, maxLength: {} });
    } finally {
      await project.cleanup();
    }
  });

  it("gives the refusal as Studio's own text alone, with no sdk hint repeated after it", async () => {
    const project = await makeFixtureProject({ maxLength: { greeting: 5 } });
    try {
      await expect(
        keySetMaxLengthHandler({ key: "greeting", maxLength: 12 }, deps(project)),
      ).rejects.toMatchObject({ code: "LENGTH_LIMIT_INVALID", message: CONFIG_KEY_REFUSAL });
    } finally {
      await project.cleanup();
    }
  });

  it("adds the sdk hint to an sdk refusal exactly once", async () => {
    const project = await makeFixtureProject();
    try {
      const failure = await keySetMaxLengthHandler(
        { key: "greeting", maxLength: 0 },
        deps(project),
      ).catch((error: Error) => error);

      const text = (failure as Error).message;
      expect(text.match(/Pass a whole number from 1 to 9007199254740991/g)).toHaveLength(1);
    } finally {
      await project.cleanup();
    }
  });

  it("does not read the config for an inherited key name", async () => {
    const project = await makeFixtureProject({ maxLength: { greeting: 5 } }, { constructor: "x" });
    try {
      expect(
        await keySetMaxLengthHandler({ key: "constructor", maxLength: 4 }, deps(project)),
      ).toEqual({ key: "constructor", maxLength: 4, changed: true });
    } finally {
      await project.cleanup();
    }
  });

  it.each([0, -1, Number.MAX_SAFE_INTEGER + 1])(
    "refuses the limit %s through the sdk",
    async (value) => {
      const project = await makeFixtureProject();
      try {
        await expect(
          keySetMaxLengthHandler({ key: "greeting", maxLength: value }, deps(project)),
        ).rejects.toMatchObject({ code: "LENGTH_LIMIT_INVALID" });
      } finally {
        await project.cleanup();
      }
    },
  );

  it("accepts the largest safe whole number", async () => {
    const project = await makeFixtureProject();
    try {
      const result = await keySetMaxLengthHandler(
        { key: "greeting", maxLength: Number.MAX_SAFE_INTEGER },
        deps(project),
      );

      expect(result.maxLength).toBe(Number.MAX_SAFE_INTEGER);
    } finally {
      await project.cleanup();
    }
  });

  it.each([
    ["a key that is not in the source", "missing", "UNKNOWN_KEY"],
    ["a key of 100000 characters", "k".repeat(100_000), "LENGTH_LIMIT_INVALID"],
  ])("refuses %s", async (_name, key, code) => {
    const project = await makeFixtureProject();
    try {
      await expect(
        keySetMaxLengthHandler({ key, maxLength: 5 }, deps(project)),
      ).rejects.toMatchObject({ code });
      await expect(readFile(limitsPath(project), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await project.cleanup();
    }
  });

  it("refuses to overwrite an invalid limits file and appends the hint", async () => {
    const project = await makeFixtureProject();
    await writeFile(limitsPath(project), "{ not json");
    try {
      await expect(
        keySetMaxLengthHandler({ key: "greeting", maxLength: 5 }, deps(project)),
      ).rejects.toThrow(/Restore verbatra\.limits\.json from version control/);
      expect(await readFile(limitsPath(project), "utf8")).toBe("{ not json");
    } finally {
      await project.cleanup();
    }
  });

  it("refuses a directory at the limits path as unusable", async () => {
    const project = await makeFixtureProject();
    await mkdir(limitsPath(project));
    try {
      await expect(
        keySetMaxLengthHandler({ key: "greeting", maxLength: 5 }, deps(project)),
      ).rejects.toMatchObject({ code: "LIMITS_FILE_UNUSABLE" });
    } finally {
      await rm(limitsPath(project), { recursive: true, force: true });
      await project.cleanup();
    }
  });

  it.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
    "reports a project directory the process cannot write as unwritable",
    async () => {
      const project = await makeFixtureProject();
      await chmod(project.root, 0o555);
      try {
        await expect(
          keySetMaxLengthHandler({ key: "greeting", maxLength: 5 }, deps(project)),
        ).rejects.toMatchObject({ code: "LIMITS_FILE_UNWRITABLE" });
      } finally {
        await chmod(project.root, 0o755);
        await project.cleanup();
      }
    },
  );

  it("uses the adapter registry it is given", async () => {
    const project = await makeFixtureProject();
    try {
      const result = await keySetMaxLengthHandler(
        { key: "greeting", maxLength: 6 },
        { ...deps(project), adapterRegistry: createDefaultRegistry() },
      );

      expect(result).toEqual({ key: "greeting", maxLength: 6, changed: true });
    } finally {
      await project.cleanup();
    }
  });

  it("passes a failure that is not an sdk error through unchanged and unhinted", async () => {
    const project = await makeFixtureProject();
    const boom = new TypeError("disk on fire");
    const failing = new Proxy({} as SdkFs, {
      get: () => async () => {
        throw boom;
      },
    });
    try {
      await expect(
        keySetMaxLengthHandler(
          { key: "greeting", maxLength: 6 },
          { ...deps(project), fs: failing },
        ),
      ).rejects.toBe(boom);
    } finally {
      await project.cleanup();
    }
  });
});
