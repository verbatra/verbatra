import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { baseConfig, makeTempDir } from "../test-support.js";
import { CONFIG_SEARCH_PLACES, configCandidatePaths, loadConfigWithMeta } from "./load-config.js";

type ModuleStyle = "esm" | "commonjs";

function moduleSource(style: ModuleStyle, targetLocale: string): string {
  const body = JSON.stringify(baseConfig({ targetLocales: [targetLocale] }));
  return style === "commonjs" ? `module.exports = ${body};` : `export default ${body};`;
}

describe("loadConfigWithMeta: fresh", () => {
  it.each([
    ["ts", "esm"],
    ["js", "esm"],
    ["js", "commonjs"],
    ["cjs", "commonjs"],
  ] as const)(
    "re-evaluates an edited verbatra.config.%s written as %s when fresh is set",
    async (extension, style) => {
      const dir = await makeTempDir();
      const file = join(dir, `verbatra.config.${extension}`);
      await writeFile(file, moduleSource(style, "de"), "utf8");

      const first = await loadConfigWithMeta({ cwd: dir, fresh: true });
      await writeFile(file, moduleSource(style, "fr"), "utf8");
      const second = await loadConfigWithMeta({ cwd: dir, fresh: true });

      expect(first.config.targetLocales).toEqual(["de"]);
      expect(second.config.targetLocales).toEqual(["fr"]);
    },
  );

  it.each([
    ["ts", "locale.ts", ["fr"]],
    ["js", "locale.mjs", ["de"]],
  ] as const)(
    "with fresh, a verbatra.config.%s importing an edited %s yields %j",
    async (extension, helper, expected) => {
      const dir = await makeTempDir();
      const helperFile = join(dir, helper);
      const config = JSON.stringify(baseConfig({ targetLocales: [] })).replace(
        '"targetLocales":[]',
        '"targetLocales":[locale]',
      );
      await writeFile(helperFile, 'export const locale = "de";', "utf8");
      await writeFile(
        join(dir, `verbatra.config.${extension}`),
        `import { locale } from "./${helper}";\nexport default ${config};`,
        "utf8",
      );

      await loadConfigWithMeta({ cwd: dir, fresh: true });
      await writeFile(helperFile, 'export const locale = "fr";', "utf8");
      const second = await loadConfigWithMeta({ cwd: dir, fresh: true });

      expect(second.config.targetLocales).toEqual(expected);
    },
  );

  it("keeps the first evaluation of an edited TypeScript config without fresh", async () => {
    const dir = await makeTempDir();
    const file = join(dir, "verbatra.config.ts");
    await writeFile(file, moduleSource("esm", "de"), "utf8");

    await loadConfigWithMeta({ cwd: dir });
    await writeFile(file, moduleSource("esm", "fr"), "utf8");
    const second = await loadConfigWithMeta({ cwd: dir });

    expect(second.config.targetLocales).toEqual(["de"]);
  });

  it("reads an edited JSON config afresh either way", async () => {
    const dir = await makeTempDir();
    const file = join(dir, ".verbatrarc.json");
    await writeFile(file, JSON.stringify(baseConfig({ targetLocales: ["de"] })), "utf8");

    await loadConfigWithMeta({ cwd: dir });
    await writeFile(file, JSON.stringify(baseConfig({ targetLocales: ["fr"] })), "utf8");

    expect((await loadConfigWithMeta({ cwd: dir })).config.targetLocales).toEqual(["fr"]);
  });
});

describe("configCandidatePaths", () => {
  it("lists only the explicit file, resolved against cwd, when configPath is set", async () => {
    const dir = await makeTempDir();

    expect(configCandidatePaths({ cwd: dir, configPath: "ci/verbatra.json" })).toEqual([
      join(dir, "ci", "verbatra.json"),
    ]);
  });

  it("lists every search place from cwd up to the repository root, nearest first", async () => {
    const root = await makeTempDir();
    await mkdir(join(root, ".git"));
    const nested = join(root, "packages", "app");
    await mkdir(nested, { recursive: true });

    const paths = configCandidatePaths({ cwd: nested });

    expect(paths).toEqual(
      [nested, join(root, "packages"), root].flatMap((dir) =>
        CONFIG_SEARCH_PLACES.map((place) => join(dir, place)),
      ),
    );
  });

  it("starts from the process working directory when no cwd is given", () => {
    expect(configCandidatePaths()[0]).toBe(join(process.cwd(), CONFIG_SEARCH_PLACES[0] ?? ""));
  });
});
