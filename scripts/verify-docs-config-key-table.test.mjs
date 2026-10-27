import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const LOCALE_SUFFIXES = ["", ".de", ".es", ".fr"];

const SCHEMA = JSON.parse(
  readFileSync(resolve(REPO_ROOT, "packages/sdk/dist/config-schema.json"), "utf8"),
);

function readRepoFile(relativePath) {
  return readFileSync(resolve(REPO_ROOT, relativePath), "utf8");
}

function constantIn(relativePath, name) {
  const source = readRepoFile(relativePath);
  const match = new RegExp(
    `const ${name}(?:: [^=]+)? = ((?:\\[[^\\]]*\\])|[^;\\n]+?)(?: as const)?;`,
  ).exec(source);
  if (match === null) {
    throw new Error(`${name} not found in ${relativePath}`);
  }
  return match[1].trim();
}

function listConstant(relativePath, name) {
  return [...constantIn(relativePath, name).matchAll(/"([^"]+)"/g)].map((match) => match[1]);
}

const SCHEMA_FILE = "packages/sdk/src/config/schema.ts";
const SENSITIVE_FILE = "packages/sdk/src/config/sensitive-config.ts";

const DEFAULTS = {
  maxBatchSize: [constantIn(SCHEMA_FILE, "DEFAULT_MAX_BATCH_SIZE")],
  "fuzzyCache.threshold": [constantIn(SCHEMA_FILE, "DEFAULT_FUZZY_THRESHOLD")],
  budgetBehavior: [constantIn(SCHEMA_FILE, "DEFAULT_BUDGET_BEHAVIOR")],
  humanEdits: [constantIn("packages/sdk/src/config/human-edits.ts", "DEFAULT_HUMAN_EDITS")],
  "files.localeStyle": [
    constantIn("packages/sdk/src/locale-path/resolver.ts", "DEFAULT_LOCALE_STYLE"),
  ],
  "sensitiveData.detectors": listConstant(SENSITIVE_FILE, "DEFAULT_SENSITIVE_DETECTORS"),
  prune: ["false"],
  generatePlurals: ["false"],
};

const ENUM_CONSTANTS = {
  "files.localeStyle": listConstant("packages/sdk/src/locale-path/style.ts", "LOCALE_STYLES"),
  "sensitiveData.mode": listConstant(SENSITIVE_FILE, "SENSITIVE_MODES"),
  humanEdits: listConstant("packages/sdk/src/config/human-edits.ts", "HUMAN_EDITS_POLICIES"),
};

const ENUMS_OWNED_ELSEWHERE = new Set(["provider.id"]);

function variantsOf(node) {
  return [node, ...(node.oneOf ?? []), ...(node.anyOf ?? [])];
}

function schemaNodes(path) {
  let nodes = [SCHEMA];
  for (const segment of path.split(".")) {
    nodes = nodes
      .flatMap(variantsOf)
      .map((node) => node.properties?.[segment])
      .filter((node) => node !== undefined);
  }
  return nodes;
}

const PATHS_OWNED_ELSEWHERE = new Set(["provider", "glossary"]);

function schemaPaths(node, prefix) {
  return variantsOf(node).flatMap((variant) =>
    Object.entries(variant.properties ?? {}).flatMap(([name, child]) => {
      const path = prefix === "" ? name : `${prefix}.${name}`;
      return PATHS_OWNED_ELSEWHERE.has(path) ? [path] : [path, ...schemaPaths(child, path)];
    }),
  );
}

function enumValues(path) {
  const values = schemaNodes(path).flatMap((node) =>
    node.enum !== undefined ? node.enum : node.const !== undefined ? [node.const] : [],
  );
  return values.length > 0 ? [...new Set(values)] : undefined;
}

function codeSpans(text) {
  return [...text.matchAll(/`([^`]+)`/g)].map((match) => match[1]);
}

function keyTable(suffix) {
  const page = readRepoFile(`apps/docs/content/docs/(configure)/config-file${suffix}.mdx`);
  const lines = page.split("\n");
  const start = lines.findIndex((line) => line.startsWith("| `$schema` |"));
  const rows = [];
  for (const line of lines.slice(start)) {
    if (!line.startsWith("| `")) {
      break;
    }
    const [key, type, fallback, since] = line.replace(/^\| /, "").split(" | ");
    rows.push({ key: codeSpans(key)[0], type, fallback, since });
  }
  return rows;
}

const TABLES = Object.fromEntries(LOCALE_SUFFIXES.map((suffix) => [suffix, keyTable(suffix)]));
const ENGLISH = TABLES[""];

function englishRow(key) {
  return ENGLISH.find((row) => row.key === key);
}

describe("config-file key table", () => {
  it("has rows and reads the defaults from the code, so the checks cannot pass vacuously", () => {
    expect(ENGLISH.length).toBeGreaterThan(30);
    expect(DEFAULTS.maxBatchSize).toEqual(["50"]);
    expect(DEFAULTS["sensitiveData.detectors"].length).toBeGreaterThan(0);
  });

  it("names only keys the shipped schema has", () => {
    for (const { key } of ENGLISH) {
      expect(schemaNodes(key).length, key).toBeGreaterThan(0);
    }
  });

  it("covers every key of the shipped schema, nested keys included", () => {
    const paths = schemaPaths(SCHEMA, "");
    expect(paths).toContain("extract.literals.ignore");
    for (const path of paths) {
      const covered = ENGLISH.some(({ key }) => key === path || key.startsWith(`${path}.`));
      expect(covered, path).toBe(true);
    }
  });

  it("lists exactly the schema's values for every enumerated key", () => {
    const enumerated = ENGLISH.filter(
      ({ key }) => enumValues(key) !== undefined && !ENUMS_OWNED_ELSEWHERE.has(key),
    );
    expect(enumerated.length).toBeGreaterThanOrEqual(7);
    for (const { key, type } of enumerated) {
      const expected = enumValues(key).map((value) => JSON.stringify(value));
      expect(codeSpans(type).sort(), key).toEqual([...expected].sort());
    }
  });

  it("keeps the schema's enumerations in step with their source constants", () => {
    for (const [key, values] of Object.entries(ENUM_CONSTANTS)) {
      expect(enumValues(key), key).toEqual(values);
    }
  });

  it("states the default each key falls back to in code", () => {
    for (const [key, values] of Object.entries(DEFAULTS)) {
      const row = englishRow(key);
      expect(row, key).toBeDefined();
      expect(
        codeSpans(row.fallback).map((span) => span.replace(/^"|"$/g, "")),
        key,
      ).toEqual(values.map((value) => value.replace(/^"|"$/g, "")));
    }
  });

  it("gives every enumerated key with a default a default from its enumeration", () => {
    for (const { key, fallback } of ENGLISH) {
      const values = enumValues(key);
      const spans = codeSpans(fallback);
      if (values === undefined || ENUMS_OWNED_ELSEWHERE.has(key) || spans.length !== 1) {
        continue;
      }
      expect(
        values.map((value) => JSON.stringify(value)),
        key,
      ).toContain(spans[0]);
    }
  });

  it("states the numeric bounds of the fuzzy threshold", () => {
    const [node] = schemaNodes("fuzzyCache.threshold");
    expect(codeSpans(englishRow("fuzzyCache.threshold").type)).toEqual([
      String(node.minimum),
      String(node.maximum),
    ]);
  });

  it("dates every key with a release version", () => {
    for (const { key, since } of ENGLISH) {
      expect(since, key).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });

  it.each(LOCALE_SUFFIXES.slice(1))(
    "config-file%s.mdx has the same keys, code values and versions as English",
    (suffix) => {
      const table = TABLES[suffix];
      expect(table.map(({ key }) => key)).toEqual(ENGLISH.map(({ key }) => key));
      table.forEach((row, index) => {
        const english = ENGLISH[index];
        expect(codeSpans(row.type), row.key).toEqual(codeSpans(english.type));
        expect(codeSpans(row.fallback), row.key).toEqual(codeSpans(english.fallback));
        expect(row.since, row.key).toBe(english.since);
      });
    },
  );
});
