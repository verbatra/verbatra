import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { pageIntroducedIn, readIntroducedIn, remarkIntroducedIn } from "./introduced-in";

const CONTENT_DIR = join(import.meta.dirname, "../content/docs");
const FRONTMATTER = /^---\n([\s\S]*?)\n---\n/;
const LEAD_AVAILABLE_FROM = /^<AvailableFrom\s+version="[^"]+"(?:\s+pkg="[^"]+")?\s*\/>$/m;

function availableFrom(version: string, pkg?: string) {
  const attributes = [{ type: "mdxJsxAttribute", name: "version", value: version }];
  if (pkg !== undefined) attributes.push({ type: "mdxJsxAttribute", name: "pkg", value: pkg });
  return { type: "mdxJsxFlowElement", name: "AvailableFrom", attributes };
}

function newPages(): string[] {
  return readdirSync(CONTENT_DIR, { recursive: true, encoding: "utf8" })
    .filter((file) => file.endsWith(".mdx"))
    .filter((file) => /^status:\s*new\s*$/m.test(readSource(file).match(FRONTMATTER)?.[1] ?? ""))
    .sort();
}

function readSource(file: string): string {
  return readFileSync(join(CONTENT_DIR, file), "utf8");
}

describe("pageIntroducedIn", () => {
  it("reads the version and package of a page-level AvailableFrom", () => {
    expect(pageIntroducedIn({ children: [availableFrom("0.11.0")] })).toEqual({
      version: "0.11.0",
    });
    expect(
      pageIntroducedIn({
        children: [{ type: "mdxjsEsm" }, availableFrom("0.2.0", "@verbatra/mcp")],
      }),
    ).toEqual({ version: "0.2.0", pkg: "@verbatra/mcp" });
  });

  it("reads the callout after an opening paragraph", () => {
    const root = { children: [{ type: "paragraph" }, availableFrom("0.2.0", "@verbatra/mcp")] };
    expect(pageIntroducedIn(root)).toEqual({ version: "0.2.0", pkg: "@verbatra/mcp" });
  });

  it("ignores an AvailableFrom that only marks a later section", () => {
    const root = { children: [{ type: "heading" }, availableFrom("0.12.0")] };
    expect(pageIntroducedIn(root)).toBeUndefined();
  });

  it("ignores other components and an AvailableFrom without a literal version", () => {
    expect(
      pageIntroducedIn({ children: [{ type: "mdxJsxFlowElement", name: "Callout" }] }),
    ).toBeUndefined();
    const expression = {
      type: "mdxJsxFlowElement",
      name: "AvailableFrom",
      attributes: [{ type: "mdxJsxAttribute", name: "version", value: { type: "expression" } }],
    };
    expect(pageIntroducedIn({ children: [expression] })).toBeUndefined();
  });
});

describe("remarkIntroducedIn", () => {
  it("stores the introducing release on the compiled file for export", () => {
    const file = { data: {} };
    remarkIntroducedIn()({ children: [availableFrom("0.11.0")] }, file);
    expect(file.data).toEqual({ introducedIn: { version: "0.11.0" } });
    const untouched = { data: {} };
    remarkIntroducedIn()({ children: [] }, untouched);
    expect(untouched.data).toEqual({});
  });
});

describe("readIntroducedIn", () => {
  it("reads the exported release and rejects malformed exports", () => {
    expect(readIntroducedIn({ introducedIn: { version: "0.3.0", pkg: "@verbatra/mcp" } })).toEqual({
      version: "0.3.0",
      pkg: "@verbatra/mcp",
    });
    expect(readIntroducedIn({ introducedIn: { version: "0.3.0", pkg: 1 } })).toEqual({
      version: "0.3.0",
    });
    expect(readIntroducedIn(undefined)).toBeUndefined();
    expect(readIntroducedIn({})).toBeUndefined();
    expect(readIntroducedIn({ introducedIn: null })).toBeUndefined();
    expect(readIntroducedIn({ introducedIn: { version: 3 } })).toBeUndefined();
  });
});

describe("pages marked new", () => {
  const pages = newPages();

  it("exist, so the guard below is not vacuous", () => {
    expect(pages.length).toBeGreaterThan(0);
  });

  it.each(pages)("%s dates its NEW badge with an AvailableFrom before any heading", (file) => {
    const lead =
      readSource(file)
        .replace(FRONTMATTER, "")
        .split(/^#{1,6} /m)[0] ?? "";
    expect(LEAD_AVAILABLE_FROM.test(lead)).toBe(true);
  });
});
