// biome-ignore-all lint/suspicious/noTemplateCurlyInString: the fixtures are source text under test, not templates
import { mkdir, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { PROVIDER_ENV } from "@verbatra/ai-providers";
import { afterEach, describe, expect, it } from "vitest";
import type { ExtractionConfig } from "../config/extraction-config.js";
import type { VerbatraConfig } from "../config/schema.js";
import { SdkError } from "../errors.js";
import { defaultFs, type SdkFs } from "../fs.js";
import { createLocalePathResolver } from "../locale-path/resolver.js";
import { baseConfig, makeTempDir, readTextFile } from "../test-support.js";
import {
  findUnusedKeys,
  type UnusedKeysReport,
  type UnusedKeysScan,
  type UnusedKeysUnreliableReason,
} from "./unused-keys.js";

const EXTRACT: ExtractionConfig = { framework: "i18next", roots: ["src"] };

const PO_HEADER =
  'msgid ""\nmsgstr "Content-Type: text/plain; charset=UTF-8\\nPlural-Forms: nplurals=2; plural=(n != 1);\\n"\n\n';

function config(overrides: Partial<VerbatraConfig> = {}): VerbatraConfig {
  return baseConfig({ extract: EXTRACT, ...overrides });
}

async function writeFiles(cwd: string, files: Readonly<Record<string, string>>): Promise<void> {
  for (const [relativePath, content] of Object.entries(files)) {
    const absolute = join(cwd, relativePath);
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, content, "utf8");
  }
}

async function projectFor(
  projectConfig: VerbatraConfig,
  catalog: string,
  files: Readonly<Record<string, string>>,
): Promise<string> {
  const cwd = await makeTempDir();
  const catalogPath = createLocalePathResolver(cwd, projectConfig).pathFor("en");
  await mkdir(dirname(catalogPath), { recursive: true });
  await writeFile(catalogPath, catalog, "utf8");
  await writeFiles(cwd, files);
  return cwd;
}

function project(
  catalog: Record<string, unknown>,
  files: Readonly<Record<string, string>>,
): Promise<string> {
  return projectFor(config(), `${JSON.stringify(catalog, null, 2)}\n`, files);
}

function scanned(report: UnusedKeysReport): UnusedKeysScan {
  if (report.status === "not-run") {
    throw new Error(`expected a scan, got not-run: ${report.reason}`);
  }
  return report;
}

function unusedKeys(report: UnusedKeysReport): readonly string[] {
  return scanned(report).unused.map((entry) => entry.key);
}

function reasons(report: UnusedKeysReport): readonly UnusedKeysUnreliableReason[] {
  return scanned(report).unreliableBecause.map((entry) => entry.reason);
}

async function unusedIn(
  catalog: Record<string, unknown>,
  files: Readonly<Record<string, string>>,
): Promise<UnusedKeysScan> {
  return scanned(await findUnusedKeys({ config: config(), cwd: await project(catalog, files) }));
}

describe("findUnusedKeys on a fully static source", () => {
  it("reports every catalog key no call site names, in catalog order", async () => {
    const report = await unusedIn(
      { nav: { home: "Home", away: "Away" }, legacy: { banner: "Old" }, footer: "Footer" },
      { "src/nav.ts": 't("nav.home");\nt("footer");' },
    );

    expect(report).toEqual({
      status: "complete",
      unreliableBecause: [],
      scannedFiles: 1,
      unused: [
        { key: "nav.away", catalogKey: "nav.away" },
        { key: "legacy.banner", catalogKey: "legacy.banner" },
      ],
      possiblyDynamic: [],
      ignored: [],
      dynamicPrefixes: [],
    });
  });

  it("never reports a key referenced in a file that nothing imports", async () => {
    const report = await unusedIn(
      { orphanHelper: { label: "Label" }, nav: { home: "Home" } },
      {
        "src/routes/index.ts": 't("nav.home");',
        "src/unused/deep/never-imported.ts": 'export const label = () => t("orphanHelper.label");',
      },
    );

    expect(report.unused).toEqual([]);
    expect(report.scannedFiles).toBe(2);
  });

  it("counts a key whose call sites disagree on its default as referenced", async () => {
    const report = await unusedIn(
      { nav: { home: "Home" } },
      { "src/a.ts": 't("nav.home", "Home");', "src/b.ts": 't("nav.home", "Start");' },
    );

    expect(report.unused).toEqual([]);
  });

  it("runs with its dependencies defaulted", async () => {
    const cwd = await project({ a: "A" }, { "src/a.ts": 't("b");' });

    expect(unusedKeys(await findUnusedKeys({ config: config(), cwd }, {}))).toEqual(["a"]);
  });
});

describe("findUnusedKeys on i18next key prefixes", () => {
  it("references a key through a getFixedT key prefix", async () => {
    const report = await unusedIn(
      { nav: { home: "Home" }, stale: "Stale" },
      { "src/a.ts": 'const t = i18n.getFixedT("en", "translation", "nav");\nt("home");' },
    );

    expect(report.status).toBe("complete");
    expect(report.unused.map((entry) => entry.key)).toEqual(["stale"]);
  });

  it("references a key through a useTranslation keyPrefix option", async () => {
    const report = await unusedIn(
      { nav: { home: "Home" }, stale: "Stale" },
      {
        "src/nav.tsx":
          'const { t } = useTranslation("translation", { keyPrefix: "nav" });\nt("home");',
      },
    );

    expect(report.status).toBe("complete");
    expect(report.unused.map((entry) => entry.key)).toEqual(["stale"]);
  });

  it("references a key through a keyPrefix property on any object literal", async () => {
    const report = await unusedIn(
      { nav: { home: "Home" }, stale: "Stale" },
      {
        "src/nav.tsx":
          'const options = { keyPrefix: "nav" };\nconst { t } = useTranslation("translation", options);\nt("home");',
      },
    );

    expect(report.status).toBe("complete");
    expect(report.unused.map((entry) => entry.key)).toEqual(["stale"]);
  });

  it("marks the result unreliable for a non-literal keyPrefix, naming the site", async () => {
    const report = await unusedIn(
      { nav: { home: "Home" }, x: "X" },
      {
        "src/nav.tsx":
          'const { t } = useTranslation("translation", { keyPrefix: prefix });\nt("home");',
      },
    );

    expect(report.status).toBe("unreliable");
    expect(report.unreliableBecause).toEqual([
      { reason: "dynamic-key-prefix", count: 1, sites: [{ file: "src/nav.tsx", line: 1 }] },
    ]);
  });

  it("stays complete for an identifier merely named keyPrefix", async () => {
    const report = await unusedIn(
      { home: "Home", x: "X" },
      { "src/a.ts": 'const keyPrefix = "nav";\nlog(keyPrefix);\nt("home");' },
    );

    expect(report.status).toBe("complete");
    expect(report.unused.map((entry) => entry.key)).toEqual(["x"]);
  });
});

describe("findUnusedKeys on aliases of the translate function", () => {
  it("follows a destructured alias from useTranslation", async () => {
    const report = await unusedIn(
      { a: "A", b: "B", stale: "Stale" },
      { "src/a.tsx": 'const { t: translate } = useTranslation();\ntranslate("a");\nt("b");' },
    );

    expect(report.status).toBe("complete");
    expect(report.unused.map((entry) => entry.key)).toEqual(["stale"]);
  });

  it("follows a variable holding i18n.t or a bound t", async () => {
    const report = await unusedIn(
      { a: "A", b: "B", c: "C", stale: "Stale" },
      {
        "src/a.ts":
          'const tr = i18n.t;\ntr("a");\nconst bound = t.bind(i18n);\nbound("b");\nt("c");',
      },
    );

    expect(report.status).toBe("complete");
    expect(report.unused.map((entry) => entry.key)).toEqual(["stale"]);
  });

  it("marks the result unreliable when t is assigned where its calls cannot be followed", async () => {
    const report = await unusedIn(
      { a: "A", b: "B" },
      { "src/a.ts": 'this.tr = t;\nthis.tr("a");\nt("b");' },
    );

    expect(report.unreliableBecause).toEqual([
      { reason: "aliased-translate-function", count: 1, sites: [{ file: "src/a.ts", line: 1 }] },
    ]);
  });
});

describe("findUnusedKeys when the translate function escapes the scan", () => {
  it.each([
    ["a JSX attribute", "src/a.tsx", 'export const A = () => <Child t={t} />;\nt("b");'],
    ["a call argument", "src/a.ts", 'renderRow(t);\nt("b");'],
    ["a returned object", "src/a.ts", 'export function api() {\n  t("b");\n  return { t };\n}'],
    ["an object property value", "src/a.ts", 'const api = { translate: t };\nt("b");'],
  ])("marks the result unreliable when t is passed on as %s", async (_name, file, content) => {
    const report = await unusedIn({ a: "A", b: "B" }, { [file]: content });

    expect(report.status).toBe("unreliable");
    expect(report.unreliableBecause.map((entry) => entry.reason)).toEqual([
      "translate-function-escapes",
    ]);
    expect(report.unreliableBecause[0]?.sites[0]?.file).toBe(file);
  });

  it.each([
    ["a direct call", 't("a");\nt("b");'],
    ["a destructured hook result", 'const { t } = useTranslation();\nt("a");\nt("b");'],
    ["a renamed hook result", 'const { t: tr } = useTranslation();\ntr("a");\ntr("b");'],
  ])("stays complete for %s", async (_name, content) => {
    const report = await unusedIn({ a: "A", b: "B" }, { "src/a.tsx": content });

    expect(report).toMatchObject({ status: "complete", unused: [] });
  });
});

describe("findUnusedKeys on keys spelled other than as a plain path", () => {
  it("references a flat dotted key through its escaped catalog key, displaying it decoded", async () => {
    const report = await unusedIn(
      { "a.b": "AB", "x.y": "XY", c: "C" },
      { "src/a.ts": 't("a.b");\nt("c");' },
    );

    expect(report.status).toBe("complete");
    expect(report.unused).toEqual([{ key: "x.y", catalogKey: "x\\.y" }]);
  });

  it("references a natural-language key with a sentence dot", async () => {
    const report = await unusedIn(
      { "Welcome. Enjoy": "W", c: "C" },
      { "src/a.ts": 't("Welcome. Enjoy");\nt("c");' },
    );

    expect(report).toMatchObject({ status: "complete", unused: [] });
  });

  it("references a namespace-qualified key by its key, without making the result unreliable", async () => {
    const report = await unusedIn(
      { nav: { home: "Home" }, c: "C" },
      { "src/a.ts": 't("common:nav.home");\nt("c");' },
    );

    expect(report).toMatchObject({ status: "complete", unused: [] });
  });

  it("references natural-language keys with an ellipsis or a colon", async () => {
    const report = await unusedIn(
      { "Loading...": "L", "Error: failed": "E", c: "C" },
      { "src/a.ts": 't("Loading...");\nt("Error: failed");\nt("c");' },
    );

    expect(report).toMatchObject({ status: "complete", unused: [] });
  });

  it("references every gettext plural form of a key through its msgid", async () => {
    const poConfig = config({ format: "gettext-po", files: { pattern: "locales/{locale}.po" } });
    const cwd = await projectFor(
      poConfig,
      `${PO_HEADER}msgid "apple"\nmsgid_plural "apples"\nmsgstr[0] "apple"\nmsgstr[1] "apples"\n\nmsgid "pear"\nmsgid_plural "pears"\nmsgstr[0] "pear"\nmsgstr[1] "pears"\n\nmsgid "c"\nmsgstr "C"\n`,
      { "src/a.ts": 't("apple", { count });\nt("c");' },
    );

    const report = scanned(await findUnusedKeys({ config: poConfig, cwd }));

    expect(report.status).toBe("complete");
    expect(report.unused).toEqual([
      { key: "pear[0]", catalogKey: "pear[0]" },
      { key: "pear[1]", catalogKey: "pear[1]" },
    ]);
  });

  it("references a gettext msgctxt entry through an i18next context option", async () => {
    const poConfig = config({ format: "gettext-po", files: { pattern: "locales/{locale}.po" } });
    const cwd = await projectFor(
      poConfig,
      `${PO_HEADER}msgctxt "menu"\nmsgid "Open"\nmsgstr "Open"\n\nmsgctxt "file"\nmsgid "Close"\nmsgstr "Close"\n\nmsgid "c"\nmsgstr "C"\n`,
      { "src/a.ts": 't("Open", { context: "menu" });\nt("c");' },
    );

    const report = scanned(await findUnusedKeys({ config: poConfig, cwd }));

    expect(report.status).toBe("complete");
    expect(report.unused).toEqual([{ key: "file|Close", catalogKey: "fileClose" }]);
  });

  it("references every Android plural quantity of a key through its name", async () => {
    const androidConfig = config({
      format: "android-xml",
      files: { pattern: "res/{locale}/strings.xml", localeStyle: "android" },
    });
    const cwd = await projectFor(
      androidConfig,
      '<?xml version="1.0" encoding="utf-8"?>\n<resources><plurals name="apple"><item quantity="one">apple</item><item quantity="other">apples</item></plurals><string name="c">C</string><string name="stale">S</string></resources>\n',
      { "src/a.ts": 't("apple", { count });\nt("c");' },
    );

    const report = scanned(await findUnusedKeys({ config: androidConfig, cwd }));

    expect(report.status).toBe("complete");
    expect(report.unused).toEqual([{ key: "stale", catalogKey: "stale" }]);
  });
});

describe("findUnusedKeys on Trans elements", () => {
  it("references a static i18nKey, staying complete", async () => {
    const report = await unusedIn(
      { nav: { home: "Home" }, c: "C" },
      { "src/a.tsx": 'export const A = () => <Trans i18nKey="nav.home">Home</Trans>;\nt("c");' },
    );

    expect(report).toMatchObject({ status: "complete", unused: [] });
  });

  it("marks the result unreliable for a Trans element without a static i18nKey", async () => {
    const report = await unusedIn(
      { Hello: "H", c: "C" },
      { "src/a.tsx": 'export const A = () => <Trans>Hello</Trans>;\nt("c");' },
    );

    expect(report.unreliableBecause).toEqual([
      { reason: "trans-without-key", count: 1, sites: [{ file: "src/a.tsx", line: 1 }] },
    ]);
  });

  it("stays complete for a Trans import alone", async () => {
    const report = await unusedIn(
      { a: "A", c: "C" },
      { "src/a.tsx": 'import { Trans } from "react-i18next";\nt("c");' },
    );

    expect(report.status).toBe("complete");
    expect(report.unused.map((entry) => entry.key)).toEqual(["a"]);
  });
});

describe("findUnusedKeys on dynamic keys", () => {
  it("lists keys under a template-literal head as possibly dynamic, not unused, and stays complete", async () => {
    const report = await unusedIn(
      { nav: { home: "Home", away: "Away" }, c: "C", d: "D" },
      { "src/a.ts": 't(`nav.${page}`);\nt("c");' },
    );

    expect(report.status).toBe("complete");
    expect(report.unused).toEqual([{ key: "d", catalogKey: "d" }]);
    expect(report.possiblyDynamic).toEqual([
      { key: "nav.home", catalogKey: "nav.home", prefix: "nav." },
      { key: "nav.away", catalogKey: "nav.away", prefix: "nav." },
    ]);
    expect(report.dynamicPrefixes).toEqual([{ prefix: "nav.", file: "src/a.ts", line: 1 }]);
  });

  it("marks the result unreliable for a fully dynamic key, naming each site once per line", async () => {
    const report = await unusedIn(
      { a: "A", c: "C" },
      { "src/a.ts": 't(x) + t(y);\nt("c");\nt(`${z}`);' },
    );

    expect(report.status).toBe("unreliable");
    expect(report.unreliableBecause).toEqual([
      {
        reason: "dynamic-keys",
        count: 2,
        sites: [
          { file: "src/a.ts", line: 1 },
          { file: "src/a.ts", line: 3 },
        ],
      },
    ]);
    expect(report.unused.map((entry) => entry.key)).toEqual(["a"]);
  });

  it("marks the result unreliable when a file could not be read to its end", async () => {
    const report = await unusedIn(
      { nav: { home: "Home" }, lost: "Lost" },
      { "src/a.ts": 't("nav.home");\n/* never closed\nt("lost");' },
    );

    expect(report.unreliableBecause).toEqual([
      {
        reason: "incomplete-scan",
        count: 1,
        sites: [{ file: "src/a.ts", detail: "unparseable" }],
      },
    ]);
    expect(report.unused.map((entry) => entry.key)).toEqual(["lost"]);
  });

  it("marks the result unreliable for a file too large to read, and still scans the rest", async () => {
    const report = await unusedIn(
      { a: "A", c: "C" },
      { "src/a.ts": 't("c");', "src/big.ts": `t("a");${" ".repeat(2_100_000)}` },
    );

    expect(report.unreliableBecause).toEqual([
      { reason: "incomplete-scan", count: 1, sites: [{ file: "src/big.ts", detail: "too-large" }] },
    ]);
  });

  it("reports an unreadable-only project as an incomplete scan, not as having no source file", async () => {
    const report = await findUnusedKeys({
      config: config(),
      cwd: await project({ a: "A" }, { "src/big.ts": `t("a");${" ".repeat(2_100_000)}` }),
    });

    expect(reasons(report)).toEqual(["incomplete-scan"]);
    expect(scanned(report).scannedFiles).toBe(0);
  });
});

describe("findUnusedKeys on template files it cannot read", () => {
  it("marks the result unreliable, listing the template files", async () => {
    const report = await unusedIn(
      { a: "A", b: "B" },
      { "src/a.ts": 't("a");', "src/App.vue": '<template>{{ $t("b") }}</template>' },
    );

    expect(report.unreliableBecause).toEqual([
      { reason: "template-files-not-scanned", count: 1, sites: [{ file: "src/App.vue" }] },
    ]);
  });

  it("caps the listed template files but counts every one", async () => {
    const files: Record<string, string> = { "src/a.ts": 't("a");' };
    for (let index = 0; index < 25; index += 1) {
      files[`src/pages/page-${String(index).padStart(2, "0")}.html`] = "<p></p>";
    }

    const report = await unusedIn({ a: "A" }, files);
    const templates = report.unreliableBecause[0];

    expect(templates?.count).toBe(25);
    expect(templates?.sites).toHaveLength(20);
  });

  it("skips template files under an excluded directory", async () => {
    const cwd = await project(
      { a: "A" },
      { "src/a.ts": 't("a");', "src/generated/App.vue": "<template />" },
    );

    const report = await findUnusedKeys({
      config: config({ extract: { ...EXTRACT, exclude: ["generated"] } }),
      cwd,
    });

    expect(scanned(report).status).toBe("complete");
  });
});

describe("findUnusedKeys on plural, context, and parent variants of a referenced key", () => {
  it("counts the plural forms of a referenced base key as referenced", async () => {
    const report = await unusedIn(
      { items_one: "{{count}} item", items_other: "{{count}} items" },
      { "src/a.ts": 't("items", { count: n });' },
    );

    expect(report.unused).toEqual([]);
  });

  it("counts every sibling plural form of a referenced plural key as referenced", async () => {
    const report = await unusedIn(
      { apples_one: "one apple", apples_other: "apples" },
      { "src/a.ts": 't("apples_one");' },
    );

    expect(report.unused).toEqual([]);
  });

  it("counts ordinal, context, and context-plural variants as referenced", async () => {
    const report = await unusedIn(
      {
        place_ordinal_one: "{{count}}st",
        friend_male: "A boyfriend",
        friend_male_one: "{{count}} boyfriend",
      },
      { "src/a.ts": 't("place", { count, ordinal: true });\nt("friend", { context });' },
    );

    expect(report.unused).toEqual([]);
  });

  it("counts every key under a referenced parent key as referenced", async () => {
    const report = await unusedIn(
      { nav: { home: "Home", away: "Away" } },
      { "src/a.ts": 't("nav", { returnObjects: true });' },
    );

    expect(report.unused).toEqual([]);
  });

  it("still reports a key that only shares an underscore prefix across a key separator", async () => {
    const report = await unusedIn(
      { button: "Button", button_group: { label: "Group" } },
      { "src/a.ts": 't("button");' },
    );

    expect(report.unused.map((entry) => entry.key)).toEqual(["button_group.label"]);
  });

  it("still reports an unreferenced plural group", async () => {
    const report = await unusedIn(
      { items_one: "item", items_other: "items" },
      { "src/a.ts": 't("other");' },
    );

    expect(report.unused.map((entry) => entry.key)).toEqual(["items_one", "items_other"]);
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
        config: config({ extract: { ...EXTRACT, unused: { ignore: ["emails.*", "cms", "nav"] } } }),
        cwd,
      }),
    );

    expect(report.unused.map((entry) => entry.key)).toEqual(["stale"]);
    expect(report.ignored.map((entry) => entry.key)).toEqual([
      "emails.welcome",
      "emails.reset",
      "cms",
    ]);
  });

  it("matches the pattern's other characters literally", async () => {
    const cwd = await project({ aXb: "x", a: { b: "y" } }, { "src/a.ts": 't("z");' });

    const report = scanned(
      await findUnusedKeys({
        config: config({ extract: { ...EXTRACT, unused: { ignore: ["a.b"] } } }),
        cwd,
      }),
    );

    expect(report.unused.map((entry) => entry.key)).toEqual(["aXb"]);
    expect(report.ignored.map((entry) => entry.key)).toEqual(["a.b"]);
  });

  it("matches the decoded key, not the escaped catalog key", async () => {
    const cwd = await project({ "Welcome. Enjoy": "W", c: "C" }, { "src/a.ts": 't("c");' });

    const report = scanned(
      await findUnusedKeys({
        config: config({ extract: { ...EXTRACT, unused: { ignore: ["Welcome. Enjoy"] } } }),
        cwd,
      }),
    );

    expect(report.unused).toEqual([]);
    expect(report.ignored).toEqual([{ key: "Welcome. Enjoy", catalogKey: "Welcome\\. Enjoy" }]);
  });

  it("prefers ignored over possibly dynamic for a key both could claim", async () => {
    const cwd = await project(
      { nav: { home: "H" }, c: "C" },
      { "src/a.ts": 't(`nav.${x}`);\nt("c")' },
    );

    const report = scanned(
      await findUnusedKeys({
        config: config({ extract: { ...EXTRACT, unused: { ignore: ["nav.*"] } } }),
        cwd,
      }),
    );

    expect(report.ignored.map((entry) => entry.key)).toEqual(["nav.home"]);
    expect(report.possiblyDynamic).toEqual([]);
  });
});

describe("findUnusedKeys when it cannot produce a trustworthy list", () => {
  it("reports that it could not run when no extract block is configured", async () => {
    const cwd = await project({ a: "A" }, {});

    const report = await findUnusedKeys({ config: baseConfig(), cwd });

    expect(report).toEqual({
      status: "not-run",
      reason: "EXTRACT_NOT_CONFIGURED",
      message: expect.stringContaining("extract block"),
    });
  });

  it.each(["next-intl-json", "vue-i18n-json", "ngx-translate-json"] as const)(
    "reports that it could not run for the %s format, whose runtime it does not model",
    async (format) => {
      const formatConfig = config({ format });
      const cwd = await projectFor(formatConfig, '{"a":"A","b":"B"}', { "src/a.ts": 't("a");' });

      const report = await findUnusedKeys({ config: formatConfig, cwd });

      expect(report).toEqual({
        status: "not-run",
        reason: "FRAMEWORK_NOT_MODELED",
        message: expect.stringContaining(format),
      });
    },
  );

  it("reports that it could not run when the scanned files reference nothing at all", async () => {
    const cwd = await project({ a: "A", b: "B" }, { "src/a.ts": "export const x = 1;" });

    const report = await findUnusedKeys({ config: config(), cwd });

    expect(report).toEqual({
      status: "not-run",
      reason: "NO_REFERENCES_FOUND",
      message: expect.stringContaining("no translation key"),
    });
  });

  it("still runs against an empty catalog when nothing is referenced", async () => {
    const cwd = await project({}, { "src/a.ts": "export const x = 1;" });

    expect(scanned(await findUnusedKeys({ config: config(), cwd })).unused).toEqual([]);
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
      message: expect.stringContaining("no source file"),
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
    await writeFiles(cwd, { "src/a.ts": 't("a");' });

    const error = await findUnusedKeys({ config: config(), cwd }).catch((caught) => caught);

    expect(error).toBeInstanceOf(SdkError);
    expect(error).toMatchObject({ code: "SOURCE_UNREADABLE" });
  });

  it("uses a source catalog handed to it instead of reading the file again", async () => {
    const cwd = await makeTempDir();
    await writeFiles(cwd, { "src/a.ts": 't("a");' });

    const report = await findUnusedKeys({
      config: config(),
      cwd,
      sourceCatalog: {
        locale: "en",
        namespace: "",
        format: "i18next-json",
        entries: new Map([
          ["a", { key: "a", namespace: "", value: "A", placeholders: [], isPlural: false }],
          ["b", { key: "b", namespace: "", value: "B", placeholders: [], isPlural: false }],
        ]),
      },
    });

    expect(unusedKeys(report)).toEqual(["b"]);
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

    const report = await findUnusedKeys({ config: config(), cwd }, { fs });

    expect(unusedKeys(report)).toEqual(["z", "m.b"]);
    expect(mutations).toEqual([]);
    expect(await readTextFile(catalogPath)).toBe(before);
    expect((await stat(catalogPath)).mtimeMs).toBe(beforeMtime);
  });

  it("runs with every provider API key variable unset", async () => {
    for (const name of Object.values(PROVIDER_ENV)) {
      saved.set(name, process.env[name]);
      delete process.env[name];
    }

    const report = await unusedIn({ a: "A", b: "B" }, { "src/a.ts": 't("a");' });

    expect(report.unused.map((entry) => entry.key)).toEqual(["b"]);
  });
});
