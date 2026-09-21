import { readFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PROVIDER_ENV } from "@verbatra/ai-providers";
import { afterEach, describe, expect, it } from "vitest";
import { baseConfig, makeTempDir, writeJsonFile } from "../test-support.js";
import { pseudolocalize } from "./pseudo.js";

const SOURCE_PATH = fileURLToPath(new URL("./pseudo.ts", import.meta.url));

const PROVIDER_ENV_VARS: readonly string[] = Object.values(PROVIDER_ENV);

describe("static proof: pseudolocalize never reaches a provider or a key", () => {
  const content = readFileSync(SOURCE_PATH, "utf8");

  it("names every provider key variable the provider package reads", () => {
    expect(PROVIDER_ENV_VARS.length).toBeGreaterThanOrEqual(5);
  });

  it("never imports the provider package", () => {
    expect(content).not.toContain("@verbatra/ai-providers");
  });

  it("never references process.env or the provider env table", () => {
    expect(content).not.toContain("process.env");
    expect(content).not.toContain("PROVIDER_ENV");
  });

  it("never selects, builds, or calls a provider", () => {
    expect(content).not.toContain("selectProvider");
    expect(content).not.toContain("buildProvider");
    expect(content).not.toContain("translateBatch");
  });

  it("reads the source it is asserting about, so the checks cannot pass vacuously", () => {
    expect(content).toContain("export async function pseudolocalize(");
  });
});

describe("runtime proof: pseudolocalize spends nothing", () => {
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
      throw new Error("a pseudolocale run must make no network request");
    };
    const dir = await makeTempDir();
    await mkdir(join(dir, "locales"));
    await writeJsonFile(join(dir, "locales", "en.json"), { greeting: "Hello {{name}}" });

    const result = await pseudolocalize({
      config: baseConfig({ targetLocales: ["de"], format: "i18next-json" }),
      cwd: dir,
    });

    expect(result.written).toBe(true);
    expect(result.transformed).toBe(1);
  });
});
