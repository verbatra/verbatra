import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { GeneratedDoc } from "fumadocs-typescript";
import { describe, expect, it } from "vitest";
import {
  readableType,
  remarkSdkTypeTable,
  remarkTypeTableMarkdown,
  SDK_DECLARATIONS,
  SDK_TYPE_TABLE_CLASS,
  sdkTypeTableOptions,
  typeTableMarkdown,
} from "@/lib/sdk-type-table";

const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const SDK_PAGES = fileURLToPath(new URL("../content/docs/sdk", import.meta.url));
const LOCALES = ["", ".de", ".es", ".fr"];
const GENERATOR_TIMEOUT = 120_000;

type Node = {
  type: string;
  name?: string;
  attributes?: { type: string; name?: string; value?: unknown }[];
  children?: Node[];
  data?: Record<string, unknown>;
};

function flowElement(name: string, attributes: Node["attributes"] = []): Node {
  return { type: "mdxJsxFlowElement", name, attributes, children: [] };
}

const entry = {
  name: "locales",
  description: "Restrict the run.\nSee {@link translate}; `a | b` stays one cell.",
  type: "readonly string[] | undefined",
  simplifiedType: "array",
  tags: [],
  required: false,
  deprecated: false,
};

describe("remarkSdkTypeTable", () => {
  it("points an SdkTypeTable at the bundled SDK declarations, keeping its name", () => {
    const table = flowElement("SdkTypeTable", [
      { type: "mdxJsxAttribute", name: "name", value: "TranslateInput" },
      { type: "mdxJsxAttribute", name: "path", value: "elsewhere.ts" },
    ]);
    const root: Node = { type: "root", children: [{ type: "paragraph", children: [table] }] };

    remarkSdkTypeTable()(root);

    expect(table.name).toBe("auto-type-table");
    expect(table.attributes).toEqual([
      { type: "mdxJsxAttribute", name: "name", value: "TranslateInput" },
      { type: "mdxJsxAttribute", name: "path", value: SDK_DECLARATIONS },
      { type: "mdxJsxAttribute", name: "id", value: "sdk-TranslateInput" },
      { type: "mdxJsxAttribute", name: "className", value: SDK_TYPE_TABLE_CLASS },
    ]);
  });

  it("gives a type rendered twice on one page a distinct id, so row anchors stay unique", () => {
    const first = flowElement("SdkTypeTable", [
      { type: "mdxJsxAttribute", name: "name", value: "ReviewDecisionInput" },
    ]);
    const second = flowElement("SdkTypeTable", [
      { type: "mdxJsxAttribute", name: "name", value: "ReviewDecisionInput" },
    ]);

    remarkSdkTypeTable()({ type: "root", children: [first, second] });

    const idOf = (node: Node) => node.attributes?.find((attribute) => attribute.name === "id");
    expect(idOf(first)?.value).toBe("sdk-ReviewDecisionInput");
    expect(idOf(second)?.value).toBe("sdk-ReviewDecisionInput-2");
  });

  it("leaves every other element alone", () => {
    const other = flowElement("TypeTable");

    remarkSdkTypeTable()({ type: "root", children: [other] });

    expect(other).toEqual(flowElement("TypeTable"));
  });
});

describe("readableType", () => {
  it("drops the undefined an optional property adds, keeping a short type readable", () => {
    expect(readableType(entry)).toBe("readonly string[]");
    expect(readableType({ type: "boolean | undefined", required: true })).toBe(
      "boolean | undefined",
    );
  });

  it("gives up on a type too long for a table cell", () => {
    expect(readableType({ type: `{ ${"field: string; ".repeat(8)}}`, required: true })).toBe(
      undefined,
    );
  });
});

describe("typeTableMarkdown", () => {
  it("renders one table row per property, escaping pipes and folding lines", () => {
    expect(typeTableMarkdown({ entries: [entry] })).toBe(
      [
        "| Property | Type | Required | Description |",
        "| --- | --- | --- | --- |",
        "| `locales` | `readonly string[]` | no | Restrict the run. See translate; `a \\| b` stays one cell. |",
      ].join("\n"),
    );
  });
});

describe("remarkTypeTableMarkdown", () => {
  it("gives a generated TypeTable a Markdown table for the .md output", () => {
    const table = flowElement("TypeTable", [
      {
        type: "mdxJsxAttribute",
        name: "type",
        value: {
          type: "mdxJsxAttributeValueExpression",
          value: JSON.stringify({ entries: [entry] }),
        },
      },
    ]);

    remarkTypeTableMarkdown()({ type: "root", children: [table] });

    expect(table.data).toEqual({
      _stringify: { text: typeTableMarkdown({ entries: [entry] }) },
    });
  });

  it("leaves a TypeTable without generated data untouched", () => {
    const table = flowElement("TypeTable");

    remarkTypeTableMarkdown()({ type: "root", children: [table] });

    expect(table.data).toBeUndefined();
  });
});

function tableNamesOf(page: string): string[] {
  const source = readFileSync(`${SDK_PAGES}/${page}`, "utf8");
  return [...source.matchAll(/<SdkTypeTable name="([^"]+)"/g)].map((match) => match[1] ?? "");
}

const englishPages = readdirSync(SDK_PAGES).filter(
  (file) => file.endsWith(".mdx") && !/\.(de|es|fr)\.mdx$/.test(file),
);

async function generatedRows(
  props: { path?: string; name: string; type?: string },
  table = sdkTypeTableOptions(REPO_ROOT, false),
): Promise<string[]> {
  const docs: GeneratedDoc[] = await table.generator.generateTypeTable(props, table.options);
  return docs.flatMap((doc) => doc.entries.map((entry) => entry.name));
}

describe("sdkTypeTableOptions", () => {
  it("renders the same SdkTypeTables on every locale of an sdk page", () => {
    for (const page of englishPages) {
      const english = tableNamesOf(page);
      for (const locale of LOCALES) {
        expect(tableNamesOf(page.replace(/\.mdx$/, `${locale}.mdx`)), `${page}${locale}`).toEqual(
          english,
        );
      }
    }
  });

  it(
    "lists only the members each SDK error class declares, never those inherited from Error",
    async () => {
      const table = sdkTypeTableOptions(REPO_ROOT, false);
      const rows = (name: string) => generatedRows({ path: SDK_DECLARATIONS, name }, table);

      expect(await rows("SdkError")).toEqual(["code"]);
      expect(await rows("ProviderError")).toEqual(["code", "envVar"]);
      expect(await rows("AdapterError")).toEqual(["code", "position"]);
      expect(await rows("BatchInterruptedError")).toEqual(["results", "entry"]);
    },
    GENERATOR_TIMEOUT,
  );

  it(
    "keeps no row declared only by the TypeScript default library on any sdk page",
    async () => {
      const table = sdkTypeTableOptions(REPO_ROOT, false);
      for (const name of new Set(englishPages.flatMap(tableNamesOf))) {
        const rows = await generatedRows({ path: SDK_DECLARATIONS, name }, table);
        expect(rows, name).not.toContain("stack");
        expect(rows, name).not.toContain("cause");
      }
    },
    GENERATOR_TIMEOUT,
  );

  it(
    "keeps an Error member a class declares itself",
    async () => {
      const rows = await generatedRows({
        name: "OwnMessageError",
        type: "export declare class OwnMessageError extends Error {\n  message: string;\n  readonly code: string;\n}",
      });

      expect(rows).toEqual(["message", "code"]);
    },
    GENERATOR_TIMEOUT,
  );
});
