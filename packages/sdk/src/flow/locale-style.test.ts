import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { VerbatraConfig } from "../config/schema.js";
import { baseConfig, makeStubProvider, makeTempDir, writeJsonFile } from "../test-support.js";
import { check } from "./check.js";
import { translate } from "./translate-project.js";

async function projectWithSource(dir: string, segments: readonly string[]): Promise<void> {
  await mkdir(join(dir, ...segments.slice(0, -1)), { recursive: true });
  await writeJsonFile(join(dir, ...segments), { greeting: "Hello" });
}

function androidConfig(targetLocales: readonly string[]): VerbatraConfig {
  return baseConfig({
    targetLocales: [...targetLocales],
    files: { pattern: "res/{locale}/messages.json", localeStyle: "android" },
  });
}

describe("translate: the android locale style", () => {
  it("reads the source from the unqualified default resource directory", async () => {
    const dir = await makeTempDir();
    await projectWithSource(dir, ["res", "values", "messages.json"]);
    const stub = makeStubProvider();

    const summary = await translate(
      { config: androidConfig(["de"]), cwd: dir },
      { createProvider: () => stub.provider },
    );

    expect(summary.failed).toEqual([]);
    expect(summary.locales[0]?.translated).toEqual(["greeting"]);
  });

  it("writes each target to its own qualifier directory", async () => {
    const dir = await makeTempDir();
    await projectWithSource(dir, ["res", "values", "messages.json"]);
    const stub = makeStubProvider();

    await translate(
      { config: androidConfig(["de", "pt-BR", "zh-Hans"]), cwd: dir },
      { createProvider: () => stub.provider },
    );

    const segments: Readonly<Record<string, string>> = {
      de: "values-de",
      "pt-BR": "values-pt-rBR",
      "zh-Hans": "values-b+zh+Hans",
    };
    for (const [locale, segment] of Object.entries(segments)) {
      const written = await readFile(join(dir, "res", segment, "messages.json"), "utf8");
      expect(JSON.parse(written)).toEqual({ greeting: `[${locale}] Hello` });
    }
  });

  it("reports pending work against the qualifier directories on a read-only run", async () => {
    const dir = await makeTempDir();
    await projectWithSource(dir, ["res", "values", "messages.json"]);
    await projectWithSource(dir, ["res", "values-de", "messages.json"]);

    const summary = await check({ config: androidConfig(["de"]), cwd: dir });

    expect(summary.locales[0]?.locale).toBe("de");
    expect(summary.locales[0]?.missing).toBe(0);
  });
});

describe("translate: the posix locale style", () => {
  it("writes a region-bearing locale with an underscore", async () => {
    const dir = await makeTempDir();
    await projectWithSource(dir, ["locale", "en", "messages.json"]);
    const stub = makeStubProvider();

    await translate(
      {
        config: baseConfig({
          targetLocales: ["pt-BR"],
          files: { pattern: "locale/{locale}/messages.json", localeStyle: "posix" },
        }),
        cwd: dir,
      },
      { createProvider: () => stub.provider },
    );

    const written = await readFile(join(dir, "locale", "pt_BR", "messages.json"), "utf8");
    expect(JSON.parse(written)).toEqual({ greeting: "[pt-BR] Hello" });
  });

  it("writes a script-bearing locale with underscores, keeping the configured case", async () => {
    const dir = await makeTempDir();
    await projectWithSource(dir, ["locale", "en", "messages.json"]);
    const stub = makeStubProvider();

    await translate(
      {
        config: baseConfig({
          targetLocales: ["zh-Hant-TW"],
          files: { pattern: "locale/{locale}/messages.json", localeStyle: "posix" },
        }),
        cwd: dir,
      },
      { createProvider: () => stub.provider },
    );

    const written = await readFile(join(dir, "locale", "zh_Hant_TW", "messages.json"), "utf8");
    expect(JSON.parse(written)).toEqual({ greeting: "[zh-Hant-TW] Hello" });
  });

  it("refuses a locale it cannot spell, before the provider is ever constructed", async () => {
    const dir = await makeTempDir();
    await projectWithSource(dir, ["locale", "en", "messages.json"]);
    let constructed = 0;

    await expect(
      translate(
        {
          config: baseConfig({
            targetLocales: ["de-1996"],
            files: { pattern: "locale/{locale}/messages.json", localeStyle: "posix" },
          }),
          cwd: dir,
        },
        {
          createProvider: () => {
            constructed += 1;
            return makeStubProvider().provider;
          },
        },
      ),
    ).rejects.toMatchObject({ code: "LOCALE_LAYOUT_INVALID" });

    expect(constructed).toBe(0);
  });
});

describe("translate: the default literal style", () => {
  it("writes the same path whether the style is omitted or named", async () => {
    const omitted = await makeTempDir();
    const named = await makeTempDir();
    for (const dir of [omitted, named]) {
      await projectWithSource(dir, ["locales", "en.json"]);
      await translate(
        {
          config: baseConfig({
            targetLocales: ["pt-BR"],
            ...(dir === named
              ? { files: { pattern: "locales/{locale}.json", localeStyle: "literal" as const } }
              : {}),
          }),
          cwd: dir,
        },
        { createProvider: () => makeStubProvider().provider },
      );
    }

    const fromOmitted = await readFile(join(omitted, "locales", "pt-BR.json"), "utf8");
    const fromNamed = await readFile(join(named, "locales", "pt-BR.json"), "utf8");
    expect(fromNamed).toBe(fromOmitted);
  });
});
