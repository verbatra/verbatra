import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DECLARATION_SPECIFIER,
  dynamicImportPattern,
  findEagerProviderImports,
  findExportTypeMismatches,
  findForbiddenSpecifiersInText,
  findRenamedDeclarations,
  getConfigSchemaFilesPattern,
  hasZodJitlessConfig,
  staticImportPattern,
  staticRequirePattern,
} from "./check-build-output.mjs";

function matchSpecifiers(text) {
  return [...text.matchAll(DECLARATION_SPECIFIER)].map((match) => match[1]);
}

describe("DECLARATION_SPECIFIER", () => {
  it("matches a named export re-export specifier", () => {
    expect(matchSpecifiers('export { foo } from "@verbatra/sdk";')).toEqual(["@verbatra/sdk"]);
  });

  it("matches a static import specifier", () => {
    expect(matchSpecifiers('import { foo } from "@verbatra/core";')).toEqual(["@verbatra/core"]);
  });

  it("matches a dynamic import specifier", () => {
    expect(matchSpecifiers('const mod = await import("@verbatra/studio");')).toEqual([
      "@verbatra/studio",
    ]);
  });

  it("matches multiple specifiers on separate lines", () => {
    const text = ['import { a } from "@verbatra/core";', 'export { b } from "@verbatra/sdk";'].join(
      "\n",
    );
    expect(matchSpecifiers(text)).toEqual(["@verbatra/core", "@verbatra/sdk"]);
  });

  it("does not match a non-verbatra package specifier", () => {
    expect(matchSpecifiers('import { z } from "zod";')).toEqual([]);
  });

  it("does not match a package name with uppercase characters, which the specifier class excludes", () => {
    expect(matchSpecifiers('import { z } from "@verbatra/SDK";')).toEqual([]);
  });

  it("does not match a bare string mentioning a package name without a from/import keyword", () => {
    expect(matchSpecifiers('const note = "@verbatra/sdk is great";')).toEqual([]);
  });

  it("does not match an unquoted specifier", () => {
    expect(matchSpecifiers("import { z } from verbatraSdk;")).toEqual([]);
  });
});

describe("dynamicImportPattern", () => {
  it("matches a realistic dynamic import call", () => {
    const pattern = dynamicImportPattern("@verbatra/studio");
    expect(pattern.test('const studio = await import("@verbatra/studio");')).toBe(true);
  });

  it("matches a dynamic import with extra internal whitespace", () => {
    const pattern = dynamicImportPattern("@verbatra/mcp");
    expect(pattern.test("import(  '@verbatra/mcp'  )")).toBe(true);
  });

  it("does not match a static import of the same package", () => {
    const pattern = dynamicImportPattern("@verbatra/studio");
    expect(pattern.test('import { start } from "@verbatra/studio";')).toBe(false);
  });

  it("does not match a dynamic import of a different package", () => {
    const pattern = dynamicImportPattern("@verbatra/studio");
    expect(pattern.test('await import("@verbatra/mcp");')).toBe(false);
  });
});

describe("staticImportPattern", () => {
  it("matches a realistic static import statement", () => {
    const pattern = staticImportPattern("@verbatra/studio");
    expect(pattern.test('import { startStudio } from "@verbatra/studio";')).toBe(true);
  });

  it("matches a realistic static re-export statement", () => {
    const pattern = staticImportPattern("@verbatra/mcp");
    expect(pattern.test('export { runServer } from "@verbatra/mcp";')).toBe(true);
  });

  it("does not match a dynamic import of the same package", () => {
    const pattern = staticImportPattern("@verbatra/studio");
    expect(pattern.test('await import("@verbatra/studio");')).toBe(false);
  });

  it("does not match a static import of a different package", () => {
    const pattern = staticImportPattern("@verbatra/studio");
    expect(pattern.test('import { runServer } from "@verbatra/mcp";')).toBe(false);
  });

  it("matches a minified static import", () => {
    expect(staticImportPattern("openai").test('let a=1;import x from"openai";')).toBe(true);
    expect(staticImportPattern("openai").test('}import{a as b}from"openai";')).toBe(true);
  });

  it("matches a side-effect import", () => {
    expect(staticImportPattern("openai").test('import "openai";')).toBe(true);
    expect(staticImportPattern("openai").test('a();import"openai";')).toBe(true);
  });

  it("matches a static import of a subpath", () => {
    expect(staticImportPattern("openai").test('import x from "openai/resources";')).toBe(true);
    expect(staticImportPattern("@google/genai").test('import{a}from"@google/genai/node"')).toBe(
      true,
    );
  });

  it("does not match a package that only shares a prefix", () => {
    expect(staticImportPattern("openai").test('import x from "openai-compatible";')).toBe(false);
  });
});

describe("staticRequirePattern", () => {
  it("matches a CommonJS require of the package", () => {
    expect(staticRequirePattern("openai").test("var OpenAI = require('openai');")).toBe(true);
  });

  it("does not match a require resolved through createRequire", () => {
    expect(staticRequirePattern("loglevel").test('createRequire(entry)("loglevel")')).toBe(false);
  });

  it("matches a minified require", () => {
    expect(staticRequirePattern("openai").test('var a=1,b=require("openai");')).toBe(true);
  });

  it("matches a require of a subpath", () => {
    expect(staticRequirePattern("openai").test("require('openai/resources')")).toBe(true);
    expect(staticRequirePattern("@google/genai").test('require("@google/genai/node")')).toBe(true);
  });

  it("matches a side-effect require", () => {
    expect(staticRequirePattern("loglevel").test('require("loglevel");')).toBe(true);
  });

  it("does not match a method named require or a different package", () => {
    expect(staticRequirePattern("openai").test("requireFn.require('openai')")).toBe(false);
    expect(staticRequirePattern("openai").test("require('@scope/openai')")).toBe(false);
  });
});

const LAZY_ENTRY = [
  "await import('@anthropic-ai/sdk');",
  "await import('openai');",
  "await import('@google/genai');",
  "await import('deepl-node');",
  "await import('loglevel');",
].join("\n");

describe("findEagerProviderImports", () => {
  it("accepts an entry that loads every provider SDK through import()", () => {
    expect(findEagerProviderImports(LAZY_ENTRY, "index.js")).toEqual([]);
  });

  it("reports a static ESM import of a provider SDK", () => {
    const text = `import OpenAI from 'openai';\n${LAZY_ENTRY}`;
    expect(findEagerProviderImports(text, "index.js")).toEqual([
      "index.js: loads openai at startup",
    ]);
  });

  it("reports a CommonJS require of a provider SDK", () => {
    const text = `var deepl = require('deepl-node');\n${LAZY_ENTRY}`;
    expect(findEagerProviderImports(text, "index.cjs")).toEqual([
      "index.cjs: loads deepl-node at startup",
    ]);
  });

  it("reports a minified side-effect import of a provider SDK subpath", () => {
    const text = `${LAZY_ENTRY};import"@google/genai/node";`;
    expect(findEagerProviderImports(text, "index.js")).toEqual([
      "index.js: loads @google/genai at startup",
    ]);
  });

  it("reports a provider SDK that is no longer imported at all", () => {
    const text = LAZY_ENTRY.replace("await import('loglevel');", "");
    expect(findEagerProviderImports(text, "index.js")).toEqual([
      'index.js: has no import("loglevel")',
    ]);
  });
});

describe("findForbiddenSpecifiersInText", () => {
  const allowed = new Set(["@verbatra/sdk", "@verbatra/studio"]);

  it("returns no hits when every specifier is on the allow list", () => {
    const text = ['import type { Config } from "@verbatra/sdk";'].join("\n");
    expect(findForbiddenSpecifiersInText(text, "dist/index.d.ts", allowed)).toEqual([]);
  });

  it("reports a specifier that is not on the allow list, with file and line number", () => {
    const text = [
      'import type { Config } from "@verbatra/sdk";',
      'import type { Entry } from "@verbatra/core";',
    ].join("\n");
    expect(findForbiddenSpecifiersInText(text, "dist/index.d.ts", allowed)).toEqual([
      "dist/index.d.ts:2: @verbatra/core",
    ]);
  });

  it("reports every forbidden hit across multiple lines", () => {
    const text = [
      'import type { A } from "@verbatra/core";',
      'import type { B } from "@verbatra/ai-providers";',
    ].join("\n");
    expect(findForbiddenSpecifiersInText(text, "dist/index.d.ts", allowed)).toEqual([
      "dist/index.d.ts:1: @verbatra/core",
      "dist/index.d.ts:2: @verbatra/ai-providers",
    ]);
  });
});

describe("findRenamedDeclarations", () => {
  it("returns no hits for declarations that keep their own name", () => {
    const text = [
      "type TranslationEntry = Readonly<Entry>;",
      "declare const PLURAL_CATEGORIES: readonly string[];",
      "interface LocaleResource {}",
    ].join("\n");
    expect(findRenamedDeclarations(text, "dist/index.d.ts")).toEqual([]);
  });

  it("reports every declaration the bundler renamed with a numeric suffix", () => {
    const text = [
      "type TranslationEntry$2 = Readonly<Entry>;",
      "declare const PLURAL_CATEGORIES$1: readonly string[];",
      "interface PlaceholderIntegrityResult$1 {}",
    ].join("\n");
    expect(findRenamedDeclarations(text, "dist/index.d.ts")).toEqual([
      "dist/index.d.ts:1: TranslationEntry$2",
      "dist/index.d.ts:2: PLURAL_CATEGORIES$1",
      "dist/index.d.ts:3: PlaceholderIntegrityResult$1",
    ]);
  });

  it("ignores a dollar sign that is not a numeric rename suffix", () => {
    const text = "type Strip = z.core.$strip;\ndeclare const $schema: string;";
    expect(findRenamedDeclarations(text, "dist/index.d.ts")).toEqual([]);
  });
});

describe("hasZodJitlessConfig", () => {
  it.each([
    "function mc(e,t){return ma(e,t)}We({jitless:!0});var hc=1",
    "z.config({ jitless: true });",
  ])("finds the jitless config call in %s", (text) => {
    expect(hasZodJitlessConfig(text)).toBe(true);
  });

  it.each([
    "if(e.jitless||typeof navigator<`u`)return!1",
    "t.jitless!==!0?(s||=o(t.shape))",
    "We({jitless:!1});",
    "",
  ])("finds no jitless config call in %s", (text) => {
    expect(hasZodJitlessConfig(text)).toBe(false);
  });
});

describe("getConfigSchemaFilesPattern", () => {
  it("digs out the pattern from a realistic emitted config schema", () => {
    const document = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        files: {
          type: "object",
          properties: {
            pattern: {
              type: "string",
              minLength: 1,
              pattern: "\\{locale\\}",
            },
            localeStyle: {
              type: "string",
              enum: ["literal", "posix", "android"],
            },
          },
          required: ["pattern"],
          additionalProperties: false,
        },
      },
    };

    expect(getConfigSchemaFilesPattern(document)).toBe("\\{locale\\}");
  });

  it("returns undefined, not a throw, when files.properties.pattern.pattern is missing", () => {
    const document = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        files: {
          type: "object",
          properties: {
            localeStyle: {
              type: "string",
              enum: ["literal", "posix", "android"],
            },
          },
        },
      },
    };

    expect(getConfigSchemaFilesPattern(document)).toBeUndefined();
  });

  it("returns undefined, not a throw, when the files property is missing entirely", () => {
    const document = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {},
    };

    expect(getConfigSchemaFilesPattern(document)).toBeUndefined();
  });
});

describe("findExportTypeMismatches", () => {
  it("flags a shared types condition that hands ESM declarations to a require consumer", () => {
    const manifest = {
      type: "module",
      exports: {
        ".": {
          types: "./dist/index.d.ts",
          import: "./dist/index.js",
          require: "./dist/index.cjs",
        },
      },
    };

    expect(findExportTypeMismatches(manifest)).toEqual([
      "exports > . > require: ./dist/index.cjs (cjs) is typed by ./dist/index.d.ts (esm)",
    ]);
  });

  it("accepts per-condition types that match each JavaScript file's module format", () => {
    const manifest = {
      type: "module",
      exports: {
        ".": {
          import: { types: "./dist/index.d.ts", default: "./dist/index.js" },
          require: { types: "./dist/index.d.cts", default: "./dist/index.cjs" },
        },
        "./config-schema.json": "./dist/config-schema.json",
      },
    };

    expect(findExportTypeMismatches(manifest)).toEqual([]);
  });

  it("accepts an ESM-only package whose single types entry matches its import", () => {
    const manifest = {
      type: "module",
      exports: { ".": { types: "./dist/index.d.ts", import: "./dist/index.js" } },
    };

    expect(findExportTypeMismatches(manifest)).toEqual([]);
  });

  it("flags .d.mts declarations paired with a .js file in a CommonJS package", () => {
    const manifest = { exports: { ".": { types: "./index.d.mts", default: "./index.js" } } };

    expect(findExportTypeMismatches(manifest)).toEqual([
      "exports > . > default: ./index.js (cjs) is typed by ./index.d.mts (esm)",
    ]);
  });

  it("ignores JavaScript targets that no types condition covers", () => {
    expect(findExportTypeMismatches({ type: "module", exports: "./index.cjs" })).toEqual([]);
    expect(findExportTypeMismatches({ type: "module" })).toEqual([]);
  });

  it("does not report the shipped package manifests", () => {
    for (const dir of ["sdk", "cli", "studio", "mcp"]) {
      const manifest = JSON.parse(
        readFileSync(new URL(`../packages/${dir}/package.json`, import.meta.url), "utf8"),
      );
      expect(findExportTypeMismatches(manifest), dir).toEqual([]);
    }
  });
});

describe("published manifests", () => {
  it.each(["sdk", "cli", "studio", "mcp"])("the %s package exports its own package.json", (dir) => {
    const manifest = JSON.parse(readFileSync(`packages/${dir}/package.json`, "utf8"));
    expect(manifest.exports["./package.json"]).toBe("./package.json");
  });
});
