import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DOCS_ROOT = resolve(REPO_ROOT, "apps/docs/content/docs");

const LOCALE_SUFFIXES = ["", ".de", ".es", ".fr"];

const CONFIG_FENCE = /^```(\w+) title="([^"]+)"[^\n]*\n([\s\S]*?)^```/gm;

const CONFIG_FILE_TITLE = /^(?:verbatra\.config\.[cm]?[jt]s|\.verbatrarc(?:\.\w+)?|package\.json)$/;

const LINKED_PACKAGES = ["sdk", "cli"];

const BASE_CONFIG = {
  sourceLocale: "en",
  targetLocales: ["de", "fr"],
  format: "i18next-json",
  files: { pattern: "locales/{locale}.json" },
  provider: { id: "gemini", options: { model: "gemini-2.5-flash", maxOutputTokens: 4096 } },
};

const EXCERPTS = {
  "(configure)/config-file": { 1: {}, 2: {}, 3: {}, 4: {}, 5: {} },
  "(configure)/formats": { 0: {} },
  "(configure)/network-policy": { 0: {}, 1: {}, 2: {} },
  "(configure)/providers": {
    0: {},
    1: {},
    2: {},
    3: {},
    4: {},
    5: {},
    6: {},
    7: {},
    8: {},
    9: {},
    10: { targetLocales: ["en-AU", "fr-BE"] },
  },
  "(get-started)/add-a-language": { 1: {} },
  "(guides)/estimating-cost": { 0: {} },
  "(guides)/extract-keys": { 0: {} },
  "(guides)/human-only-workflow": { 0: {} },
  "(guides)/protecting-human-translations": { 0: {}, 1: {} },
};

const DEFINE_CONFIG_IMPORT = 'import { defineConfig } from "@verbatra/sdk";';

const ELLIPSIS_LINE = /^ {2}\/\/ \.\.\.$/m;

function keysAt(body, indent) {
  return new Set(
    [...body.matchAll(new RegExp(`^${indent}([A-Za-z$][\\w$]*):`, "gm"))].map((match) => match[1]),
  );
}

function baseEntries(overrides, present) {
  return Object.entries({ ...BASE_CONFIG, ...overrides })
    .filter(([key]) => !present.has(key))
    .map(([key, value]) => `  ${key}: ${JSON.stringify(value)},`)
    .join("\n");
}

function splicedExcerpt(body, overrides) {
  if (ELLIPSIS_LINE.test(body)) {
    const entries = baseEntries(overrides, keysAt(body, " {2}"));
    const spliced = body.replace(ELLIPSIS_LINE, () => entries);
    return spliced.includes("import ") ? spliced : `${DEFINE_CONFIG_IMPORT}\n\n${spliced}`;
  }
  const entries = baseEntries(overrides, keysAt(body, ""));
  return `${DEFINE_CONFIG_IMPORT}\n\nexport default defineConfig({\n${entries}\n${body}\n});\n`;
}

function englishPages(directory) {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) {
      return englishPages(path);
    }
    return name.endsWith(".mdx") && !/\.(?:de|es|fr)\.mdx$/.test(name) ? [path] : [];
  });
}

function pagePrefix(path) {
  return relative(DOCS_ROOT, path).replace(/\.mdx$/, "");
}

function configExamples(page) {
  return [...page.matchAll(CONFIG_FENCE)]
    .filter(([, , title]) => CONFIG_FILE_TITLE.test(title))
    .filter(([, , title, body]) => title !== "package.json" || body.includes('"verbatra"'))
    .map(([, , title, body]) => ({ title, body }));
}

const PAGES = englishPages(DOCS_ROOT)
  .map(pagePrefix)
  .map((prefix) => ({
    prefix,
    locales: LOCALE_SUFFIXES.map((suffix) => ({
      suffix,
      examples: configExamples(readFileSync(resolve(DOCS_ROOT, `${prefix}${suffix}.mdx`), "utf8")),
    })),
  }))
  .filter(({ locales }) => locales[0].examples.length > 0);

const CASES = PAGES.flatMap(({ prefix, locales }) =>
  locales.flatMap(({ suffix, examples }) =>
    examples.map((example, index) => ({
      label: `${prefix}${suffix}.mdx #${index} (${example.title})`,
      excerpt: EXCERPTS[prefix]?.[index],
      example,
    })),
  ),
);

let projectRoot;
let loadConfig;

function projectWith(example) {
  const directory = mkdtempSync(join(projectRoot, "example-"));
  writeFileSync(join(directory, example.title), example.body);
  return directory;
}

async function loadFailure(example) {
  const cwd = projectWith(example);
  try {
    await loadConfig({ cwd, configPath: example.title });
    return undefined;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

beforeAll(async () => {
  ({ loadConfig } = await import(
    pathToFileURL(resolve(REPO_ROOT, "packages/sdk/dist/index.js")).href
  ));
  projectRoot = mkdtempSync(join(realpathSync(tmpdir()), "verbatra-docs-config-"));
  mkdirSync(join(projectRoot, ".git"));
  mkdirSync(join(projectRoot, "node_modules/@verbatra"), { recursive: true });
  for (const name of LINKED_PACKAGES) {
    symlinkSync(
      resolve(REPO_ROOT, "packages", name),
      join(projectRoot, "node_modules/@verbatra", name),
    );
  }
});

afterAll(() => {
  if (projectRoot !== undefined) {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

describe("config examples in the docs", () => {
  it("finds the config examples, so the checks below cannot pass vacuously", () => {
    expect(CASES.filter(({ excerpt }) => !excerpt).length).toBeGreaterThanOrEqual(24);
    expect(CASES.filter(({ excerpt }) => excerpt).length).toBeGreaterThanOrEqual(100);
    expect(CASES.some(({ example }) => example.title === ".verbatrarc.yaml")).toBe(true);
    expect(CASES.some(({ example }) => example.title === ".verbatrarc.json")).toBe(true);
  });

  it.each(PAGES)("$prefix has the same config examples in every locale", ({ locales }) => {
    const titles = locales.map(({ examples }) => examples.map(({ title }) => title));
    for (const localized of titles.slice(1)) {
      expect(localized).toEqual(titles[0]);
    }
  });

  it("lists only existing examples as excerpts", () => {
    for (const [prefix, excerpts] of Object.entries(EXCERPTS)) {
      const page = PAGES.find((candidate) => candidate.prefix === prefix);
      expect(page, prefix).toBeDefined();
      for (const index of Object.keys(excerpts)) {
        expect(page.locales[0].examples[index], `${prefix} #${index}`).toBeDefined();
      }
    }
  });

  it.each(CASES.filter(({ excerpt }) => !excerpt))(
    "$label loads through loadConfig",
    async ({ example }) => {
      expect(await loadFailure(example)).toBeUndefined();
    },
  );

  it.each(CASES.filter(({ excerpt }) => excerpt))(
    "$label is an excerpt that does not load on its own",
    async ({ example }) => {
      expect(await loadFailure(example)).toBeDefined();
    },
  );

  it.each(CASES.filter(({ excerpt }) => excerpt))(
    "$label loads once spliced into a minimal config",
    async ({ example, excerpt }) => {
      const spliced = { title: example.title, body: splicedExcerpt(example.body, excerpt) };
      expect(await loadFailure(spliced)).toBeUndefined();
    },
  );
});
