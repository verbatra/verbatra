import { describe, expect, it } from "vitest";
import { foldIncludedTimes, includedFiles, includedSource } from "./docs-pages";

const FILES: Record<string, string> = {
  "/c/templates/body.mdx": "---\ntitle: ignored\n---\n## Body\n\n<include>./part.mdx</include>\n",
  "/c/templates/part.mdx": "Part text.\n",
  "/c/templates/loop.mdx": "<include>./loop.mdx</include>\n",
};

function read(path: string): string {
  const source = FILES[path];
  if (source === undefined) throw new Error(`missing ${path}`);
  return source;
}

describe("includedSource", () => {
  it("replaces an include line with the target's body, nested includes resolved", () => {
    const page = "---\ntype: tutorial\n---\n<include>../templates/body.mdx</include>\n";
    expect(includedSource("/c/docs/page.mdx", page, read)).toBe(
      "---\ntype: tutorial\n---\n## Body\n\nPart text.\n",
    );
  });

  it("leaves a page without an include unchanged", () => {
    expect(includedSource("/c/docs/page.mdx", "Plain.\n", read)).toBe("Plain.\n");
  });

  it("refuses a template that includes itself", () => {
    expect(() =>
      includedSource("/c/templates/x.mdx", "<include>./loop.mdx</include>\n", read),
    ).toThrow(/includes itself/);
  });
});

describe("unsupported include forms", () => {
  it.each([
    "<include>../templates/body.mdx#steps</include>\n",
    "<include cwd>templates/body.mdx</include>\n",
    "Text <include>../templates/body.mdx</include> inline.\n",
    "<include>../templates/snippet.ts</include>\n",
  ])("refuses %j instead of measuring the page without it", (page) => {
    expect(() => includedSource("/c/docs/page.mdx", page, read)).toThrow(/only a whole-file/);
    expect(() => includedFiles("docs/page.mdx", page)).toThrow(/only a whole-file/);
  });
});

describe("includedFiles", () => {
  it("resolves each include against the including file", () => {
    expect(
      includedFiles("docs/a/b/page.mdx", "<include>../../../templates/t.de.mdx</include>\n"),
    ).toEqual(["templates/t.de.mdx"]);
  });
});

describe("foldIncludedTimes", () => {
  const sources: Record<string, string> = {
    "docs/q/react.mdx": "<include>../../templates/t.mdx</include>\n",
    "docs/q/react.de.mdx": "<include>../../templates/t.de.mdx</include>\n",
  };
  const times = {
    "docs/q/react.mdx": 10,
    "docs/q/react.de.mdx": 20,
    "docs/plain.mdx": 5,
    "templates/t.mdx": 30,
    "templates/t.de.mdx": 15,
  };

  it("dates a page by its newest include and keys it relative to the pages folder", () => {
    expect(foldIncludedTimes(times, "docs", (file) => sources[file])).toEqual({
      "q/react.mdx": 30,
      "q/react.de.mdx": 20,
      "plain.mdx": 5,
    });
  });

  it("follows a nested include, as the page renders it", () => {
    const nested: Record<string, string> = {
      "docs/page.mdx": "<include>../templates/outer.mdx</include>\n",
      "templates/outer.mdx": "<include>./inner.mdx</include>\n",
    };
    const nestedTimes = { "docs/page.mdx": 1, "templates/outer.mdx": 2, "templates/inner.mdx": 9 };
    expect(foldIncludedTimes(nestedTimes, "docs", (file) => nested[file])).toEqual({
      "page.mdx": 9,
    });
  });

  it("marks a translation outdated when only the English template changed", () => {
    const folded = foldIncludedTimes(times, "docs", (file) => sources[file]);
    expect(folded["q/react.mdx"]).toBeGreaterThan(folded["q/react.de.mdx"] ?? 0);
  });
});
