import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { AdapterError } from "@verbatra/format-adapters";
import { describe, expect, it } from "vitest";
import type { VerbatraConfig } from "../config/schema.js";
import { baseConfig, makeTempDir, writeJsonFile } from "../test-support.js";
import { check } from "./check.js";
import { diff } from "./diff.js";
import { exportWorkbook } from "./workbook/export-workbook.js";

const cfg = (overrides: Partial<VerbatraConfig> = {}): VerbatraConfig =>
  baseConfig({ targetLocales: ["de", "fr", "es"], format: "i18next-json", ...overrides });

interface Corrupt {
  readonly dir: string;
  readonly path: string;
}

async function projectWithCorruptFrench(): Promise<Corrupt> {
  const dir = await makeTempDir();
  await mkdir(join(dir, "locales"));
  await writeJsonFile(join(dir, "locales", "en.json"), { a: "Alpha" });
  await writeJsonFile(join(dir, "locales", "de.json"), { a: "Alpha" });
  await writeJsonFile(join(dir, "locales", "es.json"), { a: "A" });
  const path = join(dir, "locales", "fr.json");
  await writeFile(path, "{ broken", "utf8");
  return { dir, path };
}

describe("a corrupt target locale file is attributed to its path and locale", () => {
  it("names the path and locale on check, keeping the adapter's own error code", async () => {
    const { dir, path } = await projectWithCorruptFrench();

    const error = await check({ config: cfg(), cwd: dir }).catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(AdapterError);
    expect((error as AdapterError).code).toBe("INVALID_JSON");
    expect((error as AdapterError).message).toContain(path);
    expect((error as AdapterError).message).toContain("fr");
    expect((error as AdapterError).message).toContain(
      "The file is not valid JSON (line 1, column 3).",
    );
    expect((error as AdapterError).position).toEqual({ line: 1, column: 3 });
  });

  it("names the path and locale on diff", async () => {
    const { dir, path } = await projectWithCorruptFrench();

    const error = await diff({ config: cfg(), cwd: dir }).catch((thrown: unknown) => thrown);

    expect((error as AdapterError).message).toContain(path);
    expect((error as AdapterError).code).toBe("INVALID_JSON");
  });

  it("names the path and locale on export", async () => {
    const { dir, path } = await projectWithCorruptFrench();

    const error = await exportWorkbook({ config: cfg(), cwd: dir }).catch(
      (thrown: unknown) => thrown,
    );

    expect((error as AdapterError).message).toContain(path);
    expect((error as AdapterError).code).toBe("INVALID_JSON");
  });

  it("attributes a locale whose file is a directory rather than a regular file", async () => {
    const dir = await makeTempDir();
    await mkdir(join(dir, "locales"));
    await writeJsonFile(join(dir, "locales", "en.json"), { a: "Alpha" });
    const path = join(dir, "locales", "de.json");
    await mkdir(path);

    const error = await check({ config: cfg({ targetLocales: ["de"] }), cwd: dir }).catch(
      (thrown: unknown) => thrown,
    );

    expect((error as AdapterError).code).toBe("INVALID_STRUCTURE");
    expect((error as AdapterError).message).toContain(path);
    expect((error as AdapterError).message).toContain("The path is not a regular file.");
  });
});

describe("target-read attribution covers every adapter, not only JSON", () => {
  it("names the path on a malformed YAML target", async () => {
    const dir = await makeTempDir();
    await mkdir(join(dir, "locales"));
    await writeFile(join(dir, "locales", "en.yaml"), "a: Alpha\n", "utf8");
    const path = join(dir, "locales", "de.yaml");
    await writeFile(path, "a: [unclosed\n", "utf8");

    const error = await check({
      config: cfg({
        targetLocales: ["de"],
        format: "yaml",
        files: { pattern: "locales/{locale}.yaml" },
      }),
      cwd: dir,
    }).catch((thrown: unknown) => thrown);

    expect((error as AdapterError).code).toBe("INVALID_YAML");
    expect((error as AdapterError).message).toContain(path);
    expect((error as AdapterError).message).toContain(
      "The file is not valid YAML (line 2, column 1).",
    );
  });

  it("names the path on a malformed XLIFF target", async () => {
    const dir = await makeTempDir();
    await mkdir(join(dir, "locales"));
    await writeFile(
      join(dir, "locales", "en.xlf"),
      '<?xml version="1.0"?><xliff version="1.2"><file source-language="en" datatype="plaintext" original="m"><body><trans-unit id="a"><source>Alpha</source></trans-unit></body></file></xliff>',
      "utf8",
    );
    const path = join(dir, "locales", "de.xlf");
    await writeFile(path, "<xliff><unclosed>", "utf8");

    const error = await check({
      config: cfg({
        targetLocales: ["de"],
        format: "xliff",
        files: { pattern: "locales/{locale}.xlf" },
      }),
      cwd: dir,
    }).catch((thrown: unknown) => thrown);

    expect((error as AdapterError).message).toContain(path);
    expect((error as AdapterError).message).toContain("de");
  });
});

describe("a raw file-system error is left alone, since Node already names the path", () => {
  it("does not rewrap an error that is not an AdapterError", async () => {
    const dir = await makeTempDir();
    await mkdir(join(dir, "locales"));
    await writeJsonFile(join(dir, "locales", "en.json"), { a: "Alpha" });
    const path = join(dir, "locales", "de.json");
    await writeJsonFile(path, { a: "A" });

    const error = await check(
      { config: cfg({ targetLocales: ["de"] }), cwd: dir },
      {
        fs: {
          fileExists: async () => true,
          readFileBounded: async (probed: string) => {
            if (probed === path) {
              throw new Error("disk exploded");
            }
            return probed.endsWith("en.json")
              ? ({ kind: "ok", content: JSON.stringify({ a: "Alpha" }) } as const)
              : ({ kind: "missing" } as const);
          },
          readBytesBounded: async () => ({ kind: "missing" }) as const,
          writeFile: async () => {},
          writeBytes: async () => {},
          createExclusive: async () => true,
          deleteFile: async () => {},
        },
      },
    ).catch((thrown: unknown) => thrown);

    expect(error).not.toBeInstanceOf(AdapterError);
    expect((error as Error).message).toBe("disk exploded");
  });
});
