import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { VerbatraConfig } from "../config/schema.js";
import { baseConfig, makeStubProvider, makeTempDir, writeJsonFile } from "../test-support.js";
import { translate } from "./translate-project.js";

const config = (targetLocales: string[]): VerbatraConfig =>
  baseConfig({ targetLocales, format: "arb", files: { pattern: "l10n/app_{locale}.arb" } });

async function project(): Promise<string> {
  const dir = await makeTempDir();
  await mkdir(join(dir, "l10n"));
  await writeJsonFile(join(dir, "l10n", "app_en.arb"), {
    "@@locale": "en",
    greeting: "Hello",
    "@greeting": { description: "Greets" },
  });
  return dir;
}

async function keysOf(dir: string, locale: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(join(dir, "l10n", `app_${locale}.arb`), "utf8"));
}

describe("translate: Flutter ARB @@locale", () => {
  it("writes a new target file with @@locale for the target as its first key", async () => {
    const dir = await project();

    await translate(
      { config: config(["de", "pt-BR"]), cwd: dir },
      { createProvider: () => makeStubProvider().provider },
    );

    const de = await keysOf(dir, "de");
    expect(Object.keys(de)[0]).toBe("@@locale");
    expect(de["@@locale"]).toBe("de");
    expect((await keysOf(dir, "pt-BR"))["@@locale"]).toBe("pt_BR");
  });

  it("keeps a hand-added @@locale first when a later run adds a key", async () => {
    const dir = await project();
    await writeFile(
      join(dir, "l10n", "app_de.arb"),
      `${JSON.stringify({ greeting: "Hallo", "@@locale": "de" }, null, 2)}\n`,
    );
    await writeJsonFile(join(dir, "l10n", "app_en.arb"), {
      "@@locale": "en",
      greeting: "Hello",
      farewell: "Bye",
    });

    await translate(
      { config: config(["de"]), cwd: dir },
      { createProvider: () => makeStubProvider().provider },
    );

    expect(Object.keys(await keysOf(dir, "de"))).toEqual(["@@locale", "greeting", "farewell"]);
  });
});
