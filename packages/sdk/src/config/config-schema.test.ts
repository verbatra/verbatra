import { describe, expect, it } from "vitest";
import { z } from "zod";
import { LOCALE_CODE_PATTERN } from "./locale-code.js";
import { verbatraConfigSchema } from "./schema.js";

const SINGLE_CHILD_KEYS = ["element", "innerType", "valueType", "keyType"] as const;

function defOf(value: unknown): Record<string, unknown> | undefined {
  const internals = (value as { readonly _zod?: { readonly def?: unknown } } | null | undefined)
    ?._zod;
  const def = internals?.def;
  return typeof def === "object" && def !== null ? (def as Record<string, unknown>) : undefined;
}

function asArray(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function* childEntries(def: Record<string, unknown>): Generator<readonly [string, unknown]> {
  const shape = def.shape;
  if (typeof shape === "object" && shape !== null) {
    yield* Object.entries(shape);
  }
  for (const [index, option] of asArray(def.options).entries()) {
    yield [`[${index}]`, option];
  }
  for (const key of SINGLE_CHILD_KEYS) {
    const child = def[key];
    if (child !== undefined) {
      yield [key, child];
    }
  }
}

function joinPath(path: string, key: string): string {
  if (path === "") {
    return key;
  }
  return key.startsWith("[") ? `${path}${key}` : `${path}.${key}`;
}

function collectCustomCheckPaths(root: unknown): readonly string[] {
  const seen = new Set<unknown>();
  const found: string[] = [];

  const walk = (node: unknown, path: string): void => {
    const def = defOf(node);
    if (def === undefined || seen.has(node)) {
      return;
    }
    seen.add(node);
    for (const check of asArray(def.checks)) {
      if (defOf(check)?.check === "custom") {
        found.push(path === "" ? "<root>" : path);
      }
    }
    for (const [key, child] of childEntries(def)) {
      walk(child, joinPath(path, key));
    }
  };

  walk(root, "");
  return found;
}

type JsonSchemaObject = Readonly<Record<string, unknown>>;

function propertyOf(
  schema: JsonSchemaObject | undefined,
  key: string,
): JsonSchemaObject | undefined {
  const properties = schema?.properties;
  if (typeof properties !== "object" || properties === null) {
    return undefined;
  }
  const value = (properties as Record<string, unknown>)[key];
  return typeof value === "object" && value !== null ? (value as JsonSchemaObject) : undefined;
}

const document: JsonSchemaObject = z.toJSONSchema(verbatraConfigSchema);

describe("the config JSON Schema document: refinements that cannot be expressed", () => {
  it("carries exactly the custom checks the docs list as editor-invisible", () => {
    expect(collectCustomCheckPaths(verbatraConfigSchema)).toEqual([
      "<root>",
      "<root>",
      "sourceLocale",
      "provider[5].options.apiKeyEnvVar.innerType",
    ]);
  });
});

describe("the config JSON Schema document: the locale code rule", () => {
  const sourceLocale = propertyOf(document, "sourceLocale");
  const targetLocales = propertyOf(document, "targetLocales");

  it("emits the locale code grammar as a string pattern on both locale fields", () => {
    expect(sourceLocale).toEqual({
      type: "string",
      minLength: 1,
      pattern: LOCALE_CODE_PATTERN.source,
    });
    expect(targetLocales?.items).toEqual(sourceLocale);
  });

  it("leaves a repeated variant to the runtime check, which rejects it", () => {
    const expression = new RegExp(String(sourceLocale?.pattern));
    const parsed = verbatraConfigSchema.safeParse({
      sourceLocale: "en",
      targetLocales: ["de-1996-1996"],
      format: "i18next-json",
      files: { pattern: "locales/{locale}.json" },
      provider: { id: "none" },
    });

    expect(expression.test("de-1996-1996")).toBe(true);
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues.map((issue) => issue.path.join("."))).toEqual(["targetLocales.0"]);
  });

  it("accepts and rejects the same well-formed shapes the runtime does", () => {
    const expression = new RegExp(String(sourceLocale?.pattern));

    for (const accepted of [
      "en",
      "pt-BR",
      "zh-Hant-TW",
      "es-419",
      "sr-Latn",
      "en-US-u-ca-gregory",
    ]) {
      expect(expression.test(accepted)).toBe(true);
    }
    for (const rejected of ["en_US", "x", "english", "toString", "__proto__", "en-"]) {
      expect(expression.test(rejected)).toBe(false);
    }
  });
});

describe("the config JSON Schema document: the {locale} token rule", () => {
  const pattern = propertyOf(propertyOf(document, "files"), "pattern");

  it("emits the token rule as a string pattern, not as an invisible refinement", () => {
    expect(pattern).toEqual({ type: "string", minLength: 1, pattern: "\\{locale\\}" });
  });

  it("accepts and rejects the same patterns the runtime does", () => {
    const expression = new RegExp(String(pattern?.pattern));

    expect(expression.test("src/locales/{locale}.json")).toBe(true);
    expect(expression.test("res/{locale}/strings.xml")).toBe(true);
    expect(expression.test("src/locales/en.json")).toBe(false);
  });
});

describe("the config JSON Schema document: shape cross-check", () => {
  it("requires exactly the keys the zod shape does not mark optional", () => {
    const required = Object.entries(verbatraConfigSchema.shape)
      .filter(([, field]) => !field.safeParse(undefined).success)
      .map(([key]) => key);

    expect(document.required).toEqual(required);
  });

  it("forbids unknown keys, matching the strict object, and admits the $schema pointer", () => {
    expect(document.additionalProperties).toBe(false);
    expect(propertyOf(document, "$schema")).toEqual({ type: "string" });
  });

  it("keeps its own $schema meta key, which is what makes an editor validate against it", () => {
    expect(document.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
  });
});

describe("the config JSON Schema document: the extract block", () => {
  it("carries the unused.ignore list, so an editor validates and completes it", () => {
    const unused = propertyOf(propertyOf(document, "extract"), "unused");

    expect(propertyOf(unused, "ignore")).toEqual({
      type: "array",
      items: { type: "string", minLength: 1 },
    });
  });
});
