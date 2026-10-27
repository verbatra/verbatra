import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  JSON_SCHEMA_BASE_URL,
  JSON_SCHEMA_DIALECT,
  type JsonSchemaDocument,
  jsonSchemaUrl,
  renderJsonSchemas,
  renderOutputJsonSchema,
  SDK_JSON_SCHEMAS,
} from "./documents.js";

const rendered = renderJsonSchemas(SDK_JSON_SCHEMAS);

function closedObjects(node: unknown): number {
  if (Array.isArray(node)) {
    return node.reduce((sum: number, element) => sum + closedObjects(element), 0);
  }
  if (typeof node !== "object" || node === null) {
    return 0;
  }
  const own = (node as Record<string, unknown>).additionalProperties === false ? 1 : 0;
  return Object.values(node).reduce((sum: number, value) => sum + closedObjects(value), own);
}

function property(name: string, ...path: string[]): unknown {
  let node: unknown = rendered[name];
  for (const segment of path) {
    node = (node as Record<string, unknown>)[segment];
  }
  return node;
}

describe("renderJsonSchemas", () => {
  it("renders one document per published schema, each naming its dialect, URL and title", () => {
    expect(Object.keys(rendered).sort()).toEqual(SDK_JSON_SCHEMAS.map((d) => d.name).sort());
    for (const document of SDK_JSON_SCHEMAS) {
      expect(rendered[document.name]).toMatchObject({
        $schema: JSON_SCHEMA_DIALECT,
        $id: `${JSON_SCHEMA_BASE_URL}${document.name}.json`,
        title: document.title,
      });
    }
  });

  it("keeps every result open to fields a newer verbatra adds, and the config closed to typos", () => {
    for (const document of SDK_JSON_SCHEMAS.filter((d) => d.io === "output")) {
      expect(closedObjects(rendered[document.name]), document.name).toBe(0);
    }
    expect(closedObjects(rendered.config)).toBeGreaterThan(0);
  });

  it("points the doctor result at the data-flow manifest instead of repeating it", () => {
    expect(property("doctor-result", "properties", "dataFlow")).toEqual({
      $ref: jsonSchemaUrl("data-flow-manifest"),
    });
  });

  it("does not require a field whose value can be undefined, since JSON drops it", () => {
    expect(property("import-tmx-result", "required")).not.toContain("sourceLanguage");
    expect(property("import-tmx-result", "properties", "sourceLanguage")).toEqual({
      type: "string",
    });
  });

  it("leaves out a field a branch never carries, such as the cost of an unpriced estimate", () => {
    const branches = property("run-summary", "properties", "estimate", "anyOf") as Record<
      string,
      Record<string, unknown>
    >[];
    const unpriced = branches.find(
      (branch) => (branch.properties?.pricing as { enum?: unknown })?.enum !== undefined,
    );

    expect(branches).toHaveLength(4);
    expect(unpriced?.properties).not.toHaveProperty("cost");
    expect(JSON.stringify(rendered)).not.toContain('"not":{}');
  });

  it("refers to a document passed as a reference by its URL without rendering it", () => {
    const inner = z.object({ value: z.string() });
    const documents: JsonSchemaDocument[] = [
      { name: "outer", title: "outer", schema: z.object({ inner }), io: "output" },
    ];
    const references: JsonSchemaDocument[] = [
      { name: "inner", title: "inner", schema: inner, io: "output" },
    ];

    const result = renderJsonSchemas(documents, references);

    expect(Object.keys(result)).toEqual(["outer"]);
    expect(result.outer?.properties).toEqual({ inner: { $ref: jsonSchemaUrl("inner") } });
    expect(result.outer?.required).toEqual(["inner"]);
  });

  it("renders one output schema the same way, without stamping verbatra's $id on it", () => {
    const schema = z.object({
      kept: z.string(),
      gone: z.undefined().exactOptional(),
      maybe: z.union([z.number(), z.undefined()]),
    });

    const rendered = renderOutputJsonSchema(schema);

    expect(rendered).not.toHaveProperty("$id");
    expect(rendered).not.toHaveProperty("additionalProperties");
    expect(rendered.properties).toEqual({ kept: { type: "string" }, maybe: { type: "number" } });
    expect(rendered.required).toEqual(["kept"]);
  });

  it("drops the required list of an object whose every field may be undefined", () => {
    const documents: JsonSchemaDocument[] = [
      {
        name: "loose",
        title: "loose",
        schema: z.object({ only: z.union([z.number(), z.undefined()]) }),
        io: "output",
      },
    ];

    expect(renderJsonSchemas(documents).loose).not.toHaveProperty("required");
  });
});
