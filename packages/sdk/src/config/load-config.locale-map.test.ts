import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { baseConfig, makeTempDir } from "../test-support.js";
import { loadConfig } from "./load-config.js";

function deeplConfigJson(localeMap: string): string {
  const { provider: _provider, ...rest } = baseConfig();
  const head = JSON.stringify(rest).slice(0, -1);
  return `${head},"provider":{"id":"deepl","options":{"localeMap":${localeMap}}}}`;
}

describe("loadConfig: provider.options.localeMap raw keys", () => {
  it("refuses a __proto__ key in a JSON config like any other unconfigured key", async () => {
    const dir = await makeTempDir();
    await writeFile(join(dir, ".verbatrarc.json"), deeplConfigJson('{"__proto__": "x"}'), "utf8");

    await expect(loadConfig({ cwd: dir })).rejects.toMatchObject({
      code: "CONFIG_INVALID",
      message: expect.stringContaining(
        'provider.options.localeMap.__proto__: "__proto__" is not a configured locale',
      ),
    });
  });

  it("refuses a __proto__ key in a YAML config", async () => {
    const dir = await makeTempDir();
    const yaml = [
      "sourceLocale: en",
      "targetLocales: [de]",
      "format: i18next-json",
      'files: {pattern: "locales/{locale}.json"}',
      "provider:",
      "  id: deepl",
      "  options:",
      "    localeMap:",
      "      __proto__: x",
    ].join("\n");
    await writeFile(join(dir, ".verbatrarc.yaml"), yaml, "utf8");

    await expect(loadConfig({ cwd: dir })).rejects.toMatchObject({ code: "CONFIG_INVALID" });
  });

  it("refuses a __proto__ key in a parsed configOverride", async () => {
    const dir = await makeTempDir();
    const configOverride = JSON.parse(deeplConfigJson('{"de": "DE", "__proto__": "x"}'));

    await expect(loadConfig({ cwd: dir, configOverride })).rejects.toMatchObject({
      code: "CONFIG_INVALID",
    });
  });

  it("still loads a localeMap whose keys are all configured locales", async () => {
    const dir = await makeTempDir();
    await writeFile(join(dir, ".verbatrarc.json"), deeplConfigJson('{"de": "DE"}'), "utf8");

    const config = await loadConfig({ cwd: dir });

    expect(config.provider.options).toEqual({ localeMap: { de: "DE" } });
  });
});
