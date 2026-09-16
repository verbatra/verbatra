// biome-ignore-all lint/suspicious/noTemplateCurlyInString: the fixtures are source text under test, not templates
import { mkdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PROVIDER_ENV } from "@verbatra/ai-providers";
import { afterEach, describe, expect, it } from "vitest";
import type { ExtractionConfig } from "../config/extraction-config.js";
import type { VerbatraConfig } from "../config/schema.js";
import { SdkError } from "../errors.js";
import { defaultFs, type SdkFs } from "../fs.js";
import { baseConfig, makeTempDir, readTextFile, writeJsonFile } from "../test-support.js";
import { findUnusedKeys, type UnusedKeysReport, type UnusedKeysScan } from "./unused-keys.js";

const EXTRACT: ExtractionConfig = { framework: "i18next", roots: ["src"] };

function config(extract: ExtractionConfig = EXTRACT): VerbatraConfig {
  return baseConfig({ extract });
}

async function project(
  catalog: Record<string, unknown>,
  files: Readonly<Record<string, string>>,
): Promise<string> {
  const cwd = await makeTempDir();
  await mkdir(join(cwd, "locales"), { recursive: true });
  await writeJsonFile(join(cwd, "locales/en.json"), catalog);
  for (const [relativePath, content] of Object.entries(files)) {
    const absolute = join(cwd, relativePath);
    await mkdir(join(absolute, ".."), { recursive: true });
    await writeFile(absolute, content, "utf8");
  }
  return cwd;
}

function scanned(report: UnusedKeysReport): UnusedKeysScan {
  if (report.status === "not-run") {
    throw new Error(`expected a scan, got not-run: ${report.reason}`);
  }
  return report;
}

describe("findUnusedKeys on a fully static source", () => {
  it("reports every catalog key no call site names, in catalog order", async () => {
    const cwd = await project(
      { nav: { home: "Home", away: "Away" }, legacy: { banner: "Old" }, footer: "Footer" },
      { "src/nav.ts": 't("nav.home");\nt("footer");' },
    );

    const report = scanned(await findUnusedKeys({ config: config(), cwd }));

    expect(report).toEqual({
      status: "complete",
      unreliableBecause: [],
      scannedFiles: 1,
      unused: ["nav.away", "legacy.banner"],
      ignored: [],
      dynamic: [],
      indirect: [],
      diagnostics: [],
    });
  });

  it("never reports a key referenced in a file that nothing imports", async () => {
    const cwd = await project(
      { orphanHelper: { label: "Label" }, nav: { home: "Home" } },
      {
        "src/routes/index.ts": 't("nav.home");',
        "src/unused/deep/never-imported.ts": 'export const label = () => t("orphanHelper.label");',
      },
    );

    const report = scanned(await findUnusedKeys({ config: config(), cwd }));

    expect(report.unused).toEqual([]);
    expect(report.scannedFiles).toBe(2);
  });

  it("counts a key whose call sites disagree on its default as referenced", async () => {
    const cwd = await project(
      { nav: { home: "Home" } },
      { "src/a.ts": 't("nav.home", "Home");', "src/b.ts": 't("nav.home", "Start");' },
    );

    const report = scanned(await findUnusedKeys({ config: config(), cwd }));

    expect(report.unused).toEqual([]);
  });

  it("runs with its dependencies defaulted", async () => {
    const cwd = await project({ a: "A" }, { "src/a.ts": 't("b");' });

    expect(scanned(await findUnusedKeys({ config: config(), cwd }, {})).unused).toEqual(["a"]);
  });
});

describe("findUnusedKeys never quietly misreports a key reachable some other way", () => {
  it("marks the result unreliable when a call site's key is dynamic, naming the site", async () => {
    const cwd = await project(
      { errors: { notFound: "Not found" }, nav: { home: "Home" } },
      { "src/errors.ts": 't("nav.home");\nexport const m = (code) => t("errors." + code);' },
    );

    const report = scanned(await findUnusedKeys({ config: config(), cwd }));

    expect(report.status).toBe("unreliable");
    expect(report.unreliableBecause).toEqual(["dynamic-keys"]);
    expect(report.dynamic).toEqual([{ file: "src/errors.ts", line: 2 }]);
    expect(report.unused).toEqual(["errors.notFound"]);
  });

  it("marks a namespace-qualified key as dynamic, since it is read as one", async () => {
    const cwd = await project({ nav: { home: "Home" } }, { "src/a.ts": 't("common:nav.home");' });

    const report = scanned(await findUnusedKeys({ config: config(), cwd }));

    expect(report.unreliableBecause).toEqual(["dynamic-keys"]);
  });

  it("marks the result unreliable when a keyPrefix scopes the calls under it", async () => {
    const cwd = await project(
      { nav: { home: "Home" } },
      {
        "src/nav.tsx":
          'const { t } = useTranslation("translation", { keyPrefix: "nav" });\nt("home");',
      },
    );

    const report = scanned(await findUnusedKeys({ config: config(), cwd }));

    expect(report.status).toBe("unreliable");
    expect(report.unreliableBecause).toEqual(["indirect-key-sites"]);
    expect(report.indirect).toEqual([{ file: "src/nav.tsx", line: 1 }]);
  });

  it("marks the result unreliable when a file could not be read to its end", async () => {
    const cwd = await project(
      { nav: { home: "Home" }, lost: "Lost" },
      { "src/a.ts": 't("nav.home");\n/* never closed\nt("lost");' },
    );

    const report = scanned(await findUnusedKeys({ config: config(), cwd }));

    expect(report.unreliableBecause).toEqual(["incomplete-scan"]);
    expect(report.diagnostics).toEqual([{ file: "src/a.ts", reason: "unparseable" }]);
    expect(report.unused).toEqual(["lost"]);
  });
});

describe("findUnusedKeys on plural, context, and parent variants of a referenced key", () => {
  it("counts the plural forms of a referenced base key as referenced", async () => {
    const cwd = await project(
      { items_one: "{{count}} item", items_other: "{{count}} items" },
      { "src/a.ts": 't("items", { count: n });' },
    );

    expect(scanned(await findUnusedKeys({ config: config(), cwd })).unused).toEqual([]);
  });

  it("counts every sibling plural form of a referenced plural key as referenced", async () => {
    const cwd = await project(
      { apples_one: "one apple", apples_other: "apples" },
      { "src/a.ts": 't("apples_one");' },
    );

    expect(scanned(await findUnusedKeys({ config: config(), cwd })).unused).toEqual([]);
  });

  it("counts ordinal, context, and context-plural variants as referenced", async () => {
    const cwd = await project(
      {
        place_ordinal_one: "{{count}}st",
        friend_male: "A boyfriend",
        friend_male_one: "{{count}} boyfriend",
      },
      { "src/a.ts": 't("place", { count, ordinal: true });\nt("friend", { context });' },
    );

    expect(scanned(await findUnusedKeys({ config: config(), cwd })).unused).toEqual([]);
  });

  it("counts every key under a referenced parent key as referenced", async () => {
    const cwd = await project(
      { nav: { home: "Home", away: "Away" } },
      { "src/a.ts": 't("nav", { returnObjects: true });' },
    );

    expect(scanned(await findUnusedKeys({ config: config(), cwd })).unused).toEqual([]);
  });

  it("still reports a key that only shares an underscore prefix across a key separator", async () => {
    const cwd = await project(
      { button: "Button", button_group: { label: "Group" } },
      { "src/a.ts": 't("button");' },
    );

    expect(scanned(await findUnusedKeys({ config: config(), cwd })).unused).toEqual([
      "button_group.label",
    ]);
  });

  it("still reports an unreferenced plural group", async () => {
    const cwd = await project(
      { items_one: "item", items_other: "items" },
      { "src/a.ts": 't("other");' },
    );

    expect(scanned(await findUnusedKeys({ config: config(), cwd })).unused).toEqual([
      "items_one",
      "items_other",
    ]);
  });
});

describe("findUnusedKeys with an ignore list", () => {
  it("reports an ignored key as ignored, by exact key and by wildcard, never as unused", async () => {
    const cwd = await project(
      { emails: { welcome: "Hi", reset: "Reset" }, cms: "CMS", stale: "Stale", nav: "Nav" },
      { "src/a.ts": 't("nav");' },
    );

    const report = scanned(
      await findUnusedKeys({
        config: config({ ...EXTRACT, ignoreUnused: ["emails.*", "cms", "nav"] }),
        cwd,
      }),
    );

    expect(report.unused).toEqual(["stale"]);
    expect(report.ignored).toEqual(["emails.welcome", "emails.reset", "cms"]);
  });

  it("matches the pattern's other characters literally", async () => {
    const cwd = await project({ aXb: "x", a: { b: "y" } }, { "src/a.ts": 't("z");' });

    const report = scanned(
      await findUnusedKeys({ config: config({ ...EXTRACT, ignoreUnused: ["a.b"] }), cwd }),
    );

    expect(report.unused).toEqual(["aXb"]);
    expect(report.ignored).toEqual(["a.b"]);
  });
});

describe("findUnusedKeys when there is nothing to scan", () => {
  it("reports that it could not run when no extract block is configured", async () => {
    const cwd = await project({ a: "A" }, {});

    const report = await findUnusedKeys({ config: baseConfig(), cwd });

    expect(report).toEqual({
      status: "not-run",
      reason: "EXTRACT_NOT_CONFIGURED",
      message: expect.stringContaining("extract block"),
    });
  });

  it("reports that it could not run on a file system with no readDirectory", async () => {
    const cwd = await project({ a: "A" }, { "src/a.ts": 't("b");' });
    const { readDirectory: _omitted, ...withoutReadDirectory } = defaultFs;

    const report = await findUnusedKeys(
      { config: config(), cwd },
      { fs: withoutReadDirectory as SdkFs },
    );

    expect(report).toMatchObject({ status: "not-run", reason: "EXTRACT_FS_UNSUPPORTED" });
  });

  it("reports that it could not run when the roots hold no source file, not every key as unused", async () => {
    const cwd = await project({ a: "A", b: "B" }, { "docs/readme.md": "t('a')" });

    const report = await findUnusedKeys({ config: config(), cwd });

    expect(report).toEqual({
      status: "not-run",
      reason: "NO_SOURCE_FILES",
      message: expect.stringContaining("no file"),
    });
    expect("unused" in report).toBe(false);
  });

  it("lets any other failure escape rather than disguising it as not-run", async () => {
    const cwd = await project({ a: "A" }, { "src/a.ts": 't("a");' });
    const failure = new Error("extractor exploded");

    await expect(
      findUnusedKeys(
        { config: config(), cwd },
        {
          createExtractor: () => {
            throw failure;
          },
        },
      ),
    ).rejects.toBe(failure);
  });

  it("surfaces a missing source catalog as the usual SdkError", async () => {
    const cwd = await makeTempDir();
    await mkdir(join(cwd, "src"));
    await writeFile(join(cwd, "src/a.ts"), 't("a");', "utf8");

    const error = await findUnusedKeys({ config: config(), cwd }).catch((caught) => caught);

    expect(error).toBeInstanceOf(SdkError);
    expect(error).toMatchObject({ code: "SOURCE_UNREADABLE" });
  });
});

describe("findUnusedKeys is read-only and spends nothing", () => {
  const saved = new Map<string, string | undefined>();

  afterEach(() => {
    for (const [name, value] of saved) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
    saved.clear();
  });

  it("never writes, deletes, or reorders the catalog", async () => {
    const cwd = await project(
      { z: "Z", a: "A", m: { b: "B" } },
      { "src/a.ts": 't("a");\nt(dynamic);' },
    );
    const catalogPath = join(cwd, "locales/en.json");
    const before = await readTextFile(catalogPath);
    const beforeMtime = (await stat(catalogPath)).mtimeMs;
    const mutations: string[] = [];
    const record =
      (name: string) =>
      async (path: string): Promise<never> => {
        mutations.push(`${name} ${path}`);
        throw new Error("no write expected");
      };
    const fs: SdkFs = {
      ...defaultFs,
      writeFile: record("writeFile"),
      writeBytes: record("writeBytes"),
      createExclusive: record("createExclusive"),
      deleteFile: record("deleteFile"),
      mkdir: record("mkdir"),
    };

    const report = scanned(await findUnusedKeys({ config: config(), cwd }, { fs }));

    expect(report.unused).toEqual(["z", "m.b"]);
    expect(mutations).toEqual([]);
    expect(await readTextFile(catalogPath)).toBe(before);
    expect((await stat(catalogPath)).mtimeMs).toBe(beforeMtime);
  });

  it("runs with every provider API key variable unset", async () => {
    for (const name of Object.values(PROVIDER_ENV)) {
      saved.set(name, process.env[name]);
      delete process.env[name];
    }
    const cwd = await project({ a: "A", b: "B" }, { "src/a.ts": 't("a");' });

    const report = scanned(await findUnusedKeys({ config: config(), cwd }));

    expect(report.unused).toEqual(["b"]);
  });
});
