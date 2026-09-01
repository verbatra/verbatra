import { describe, expect, it } from "vitest";
import {
  DECLARATION_SPECIFIER,
  dynamicImportPattern,
  findForbiddenSpecifiersInText,
  getConfigSchemaFilesPattern,
  staticImportPattern,
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
