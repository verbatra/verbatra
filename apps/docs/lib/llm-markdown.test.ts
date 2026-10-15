import { createProcessor } from "@mdx-js/mdx";
import { describe, expect, it } from "vitest";
import { fencedMarkdown, inlineCodeMarkdown } from "./llm-markdown";

type ParsedNode = { type: string; value?: string; lang?: string | null; meta?: string | null };
type ParsedParent = ParsedNode & { children?: ParsedParent[] };

const markdown = createProcessor({ format: "md" });

function parsedNodes(text: string, type: string): ParsedNode[] {
  const found: ParsedNode[] = [];
  const visit = (node: ParsedParent): void => {
    if (node.type === type) found.push(node);
    for (const child of node.children ?? []) visit(child);
  };
  visit(markdown.parse(text) as ParsedParent);
  return found;
}

describe("fencedMarkdown", () => {
  it("fences plain code with three backticks", () => {
    expect(fencedMarkdown("bash", null, "npm install")).toBe("```bash\nnpm install\n```");
  });

  it("fences code that holds a triple-backtick run with a longer fence", () => {
    const code = "```ts\nconst a = 1;\n```";
    expect(fencedMarkdown("md", 'title="x.md"', code)).toBe(
      `\`\`\`\`md title="x.md"\n${code}\n\`\`\`\``,
    );
  });

  it("switches to a tilde fence longer than any tilde run when the meta holds a backtick", () => {
    const code = "~~~\n```ts\nconst a = 1;\n```";
    const fenced = fencedMarkdown("md", 'title="`x`.md"', code);
    expect(fenced).toBe(`~~~~md title="\`x\`.md"\n${code}\n~~~~`);
    expect(parsedNodes(fenced, "code")).toEqual([
      expect.objectContaining({ lang: "md", meta: 'title="`x`.md"', value: code }),
    ]);
  });

  it.each([
    ["bash", null, "npm install"],
    ["md", 'title="x.md"', "```ts\nconst a = 1;\n```"],
  ])("round-trips %s code through a markdown parser", (lang, meta, code) => {
    expect(parsedNodes(fencedMarkdown(lang, meta, code), "code")).toEqual([
      expect.objectContaining({ lang, meta, value: code }),
    ]);
  });
});

describe("inlineCodeMarkdown", () => {
  it("wraps a plain value in one backtick", () => {
    expect(inlineCodeMarkdown("en.json")).toBe("`en.json`");
  });

  it("wraps a value holding a backtick in a longer run", () => {
    expect(inlineCodeMarkdown("a`b")).toBe("``a`b``");
  });

  it("pads a value that starts or ends with a backtick", () => {
    expect(inlineCodeMarkdown("`a")).toBe("`` `a ``");
  });

  it("pads a value that starts and ends with a space", () => {
    expect(inlineCodeMarkdown(" a ")).toBe("`  a  `");
  });

  it("leaves an all-spaces value unpadded", () => {
    expect(inlineCodeMarkdown("  ")).toBe("`  `");
  });

  it("writes nothing for an empty value, since an empty code span cannot be written", () => {
    expect(inlineCodeMarkdown("")).toBe("");
    expect(parsedNodes(`a${inlineCodeMarkdown("")}b`, "inlineCode")).toEqual([]);
  });

  it.each([" a ", " `a` ", "`", "a`", "`a", "a`b", "en.json", "  ", " a", "a "])(
    "round-trips %j through a markdown parser",
    (value) => {
      expect(parsedNodes(`x ${inlineCodeMarkdown(value)} y`, "inlineCode")).toEqual([
        expect.objectContaining({ value }),
      ]);
    },
  );
});
