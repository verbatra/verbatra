import { readdirSync } from "node:fs";
import { join } from "node:path";
import { rehypeCodeDefaultOptions } from "fumadocs-core/mdx-plugins";
import { describe, expect, it } from "vitest";
import { OUTPUT_ATTRIBUTE, parseCodeBlockMeta, rehypeCodeOptions } from "./code-block-meta";
import { readIncludedSource } from "./docs-pages";

const CONTENT_DIR = join(import.meta.dirname, "../content/docs");
type MetaArguments = Parameters<typeof parseCodeBlockMeta>;

const NODE: MetaArguments[1] = { type: "element", tagName: "pre", properties: {}, children: [] };
const TREE: MetaArguments[2] = { type: "root", children: [] };

describe("parseCodeBlockMeta", () => {
  it("marks a fence flagged output, whatever language the page is in", () => {
    expect(parseCodeBlockMeta("output", NODE, TREE)).toMatchObject({ [OUTPUT_ATTRIBUTE]: true });
  });

  it("keeps the default attributes alongside the flag", () => {
    const data = parseCodeBlockMeta('title="verbatra.config.ts" output noCopy', NODE, TREE);

    expect(data).toMatchObject({
      title: "verbatra.config.ts",
      allowCopy: "false",
      [OUTPUT_ATTRIBUTE]: true,
    });
  });

  it("leaves an unflagged fence unmarked, so a title alone never makes a block output", () => {
    const data = parseCodeBlockMeta('title="Output"', NODE, TREE);

    expect(data).toMatchObject({ title: "Output" });
    expect(data).not.toHaveProperty(OUTPUT_ATTRIBUTE);
  });
});

describe("rehypeCodeOptions", () => {
  it("keeps Fumadocs' themes and transformers and swaps in the output-aware meta parser", () => {
    expect(rehypeCodeOptions).toEqual({
      ...rehypeCodeDefaultOptions,
      parseMetaString: parseCodeBlockMeta,
    });
  });
});

describe("docs content", () => {
  it("marks output with the flag, never with an English title a translated page would show", () => {
    const titled = readdirSync(CONTENT_DIR, { recursive: true, encoding: "utf8" })
      .filter((file) => file.endsWith(".mdx"))
      .filter((file) =>
        /^```\w*[^\n]*title="Output"/m.test(readIncludedSource(join(CONTENT_DIR, file))),
      );

    expect(titled).toEqual([]);
  });
});
