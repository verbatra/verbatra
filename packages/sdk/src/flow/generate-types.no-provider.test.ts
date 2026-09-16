import { readFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PROVIDER_ENV } from "@verbatra/ai-providers";
import { afterEach, describe, expect, it } from "vitest";
import { baseConfig, makeTempDir, writeJsonFile } from "../test-support.js";
import { generateTypes } from "./generate-types.js";

const SOURCE_PATHS = [
  fileURLToPath(new URL("./generate-types.ts", import.meta.url)),
  fileURLToPath(new URL("./types-declaration.ts", import.meta.url)),
  fileURLToPath(new URL("./message-arguments.ts", import.meta.url)),
];

const PROVIDER_ENV_VARS: readonly string[] = Object.values(PROVIDER_ENV);

describe("static proof: generating types never reaches a provider or a key", () => {
  const sources = SOURCE_PATHS.map((path) => readFileSync(path, "utf8"));

  it("names every provider key variable the provider package reads", () => {
    expect(PROVIDER_ENV_VARS.length).toBeGreaterThanOrEqual(5);
  });

  it("reads the three source files it is asserting about, so the checks cannot pass vacuously", () => {
    expect(sources).toHaveLength(3);
    expect(sources[0]).toContain("export async function generateTypes(");
    expect(sources[1]).toContain("export function renderTypesDeclaration(");
    expect(sources[2]).toContain("export function describeMessageArguments(");
  });

  it.each(SOURCE_PATHS.map((path, index) => [path, index] as const))(
    "never imports the provider package, reads an environment variable, or calls a provider in %s",
    (_path, index) => {
      const content = sources[index] ?? "";

      expect(content).not.toContain("@verbatra/ai-providers");
      expect(content).not.toContain("process.env");
      expect(content).not.toContain("PROVIDER_ENV");
      expect(content).not.toContain("selectProvider");
      expect(content).not.toContain("buildProvider");
      expect(content).not.toContain("translateBatch");
      expect(content).not.toContain("fetch(");
    },
  );
});

describe("runtime proof: generating types spends nothing", () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = new Map(PROVIDER_ENV_VARS.map((name) => [name, process.env[name]]));

  afterEach(() => {
    globalThis.fetch = originalFetch;
    for (const [name, value] of originalEnv) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  });

  it("succeeds with every provider key unset and every network call fatal", async () => {
    for (const name of PROVIDER_ENV_VARS) {
      delete process.env[name];
    }
    globalThis.fetch = (): never => {
      throw new Error("generating types must make no network request");
    };
    const dir = await makeTempDir();
    await mkdir(join(dir, "locales"));
    await writeJsonFile(join(dir, "locales", "en.json"), { greeting: "Hello {{name}}" });

    const result = await generateTypes({ config: baseConfig(), cwd: dir });

    expect(result).toMatchObject({ keys: 1, withArguments: 1, written: true });
  });

  it("never reads a target locale file", async () => {
    const dir = await makeTempDir();
    await mkdir(join(dir, "locales"));
    await writeJsonFile(join(dir, "locales", "en.json"), { greeting: "Hello {{name}}" });
    await writeJsonFile(join(dir, "locales", "de.json"), { onlyInGerman: "Hallo" });

    await generateTypes({ config: baseConfig(), cwd: dir });
    const read: string[] = [];
    await generateTypes(
      { config: baseConfig(), cwd: dir, check: true },
      {
        fs: {
          ...(await import("../fs.js")).defaultFs,
          readFileBounded: async (path, maxBytes) => {
            read.push(path);
            return (await import("../fs.js")).defaultFs.readFileBounded(path, maxBytes);
          },
        },
      },
    );

    expect(read).not.toContain(join(dir, "locales", "de.json"));
    expect(read).toContain(join(dir, "locales", "en.json"));
  });
});
