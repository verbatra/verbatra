import { describe, expect, it } from "vitest";
import { fencedMarkdown, inlineCodeMarkdown } from "./llm-markdown";

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
});
