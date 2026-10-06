import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  remarkAgentEntryMarkdown,
  START_HERE_COMPONENT,
  START_HERE_MARKDOWN,
  START_HERE_PAGES,
} from "./agent-entry";
import { AI_SETUP_PROMPT_MARKDOWN } from "./ai-setup-prompt";
import { AGENT_INIT_COMMAND } from "./install-commands";
import { MCP_INSTALL_COMPONENT, mcpInstallMarkdown } from "./mcp-install-links";

const DOCS_DIR = fileURLToPath(new URL("../", import.meta.url));
const CONTENT_DIR = join(DOCS_DIR, "content/docs");
const LOCALE_SUFFIXES = ["", ".de", ".es", ".fr"] as const;
const START_HERE_ELEMENT = `<${START_HERE_COMPONENT} />`;
const FRONTMATTER = /^---\n[\s\S]*?\n---\n/;

function page(slug: string, suffix: string): string {
  return readFileSync(join(CONTENT_DIR, `${slug}${suffix}.mdx`), "utf8");
}

function sourceFiles(dir: string): string[] {
  return readdirSync(join(DOCS_DIR, dir), { recursive: true, encoding: "utf8" })
    .filter((file) => /\.(ts|tsx)$/.test(file) && !/\.test\.tsx?$/.test(file))
    .map((file) => join(dir, file));
}

type Node = {
  type: string;
  name?: string;
  attributes?: Array<{ type: string; name: string; value: unknown }>;
  children?: Node[];
  data?: Record<string, unknown>;
};

function element(name: string, attributes: Node["attributes"] = []): Node {
  return { type: "mdxJsxFlowElement", name, attributes, children: [] };
}

function stringified(node: Node): unknown {
  remarkAgentEntryMarkdown()({ type: "root", children: [node] });
  return node.data?._stringify;
}

describe("the Start here banner", () => {
  const cases = START_HERE_PAGES.flatMap((slug) =>
    LOCALE_SUFFIXES.map((suffix) => [slug, suffix] as const),
  );

  it.each(cases)("opens %s%s.mdx, once, before any prose", (slug, suffix) => {
    const mdx = page(slug, suffix);
    const body = mdx.replace(FRONTMATTER, "");
    expect(body.startsWith(`${START_HERE_ELEMENT}\n\n`)).toBe(true);
    expect(mdx.split(START_HERE_ELEMENT)).toHaveLength(2);
  });

  it("sits on no page outside the list, so the list stays the one record of where it is", () => {
    const pages = readdirSync(CONTENT_DIR, { recursive: true, encoding: "utf8" }).filter(
      (file) =>
        file.endsWith(".mdx") &&
        readFileSync(join(CONTENT_DIR, file), "utf8").includes(START_HERE_ELEMENT),
    );
    const expected = START_HERE_PAGES.flatMap((slug) =>
      LOCALE_SUFFIXES.map((suffix) => `${slug}${suffix}.mdx`),
    );
    expect(pages.sort()).toEqual(expected.sort());
  });

  it("gives the page's Markdown output the command and the prompt as fences", () => {
    expect(stringified(element(START_HERE_COMPONENT))).toEqual({ text: START_HERE_MARKDOWN });
    expect(START_HERE_MARKDOWN).toBe(
      `\`\`\`bash\n${AGENT_INIT_COMMAND}\n\`\`\`\n\n${AI_SETUP_PROMPT_MARKDOWN}`,
    );
  });
});

describe("the agent setup command", () => {
  it("is the one command the docs recommend for wiring a coding agent", () => {
    expect(AGENT_INIT_COMMAND).toBe("npx verbatra init --agent");
  });

  it("is written out only in lib/install-commands.ts, so the landing, the docs home and the banner cannot drift apart", () => {
    const files = [...sourceFiles("app"), ...sourceFiles("components"), ...sourceFiles("lib")];
    const writers = files.filter((file) =>
      readFileSync(join(DOCS_DIR, file), "utf8").includes("init --agent"),
    );
    expect(writers).toEqual(["lib/install-commands.ts"]);
  });

  it.each(["components/landing-hero.tsx", "components/docs-home.tsx"])(
    "reaches %s through the one install box",
    (file) => {
      expect(readFileSync(join(DOCS_DIR, file), "utf8")).toContain(
        'import { PackageInstall } from "@/components/landing/package-install";',
      );
    },
  );
});

describe("remarkAgentEntryMarkdown", () => {
  it.each(["cursor", "vscode"] as const)(
    "writes the %s install link as a Markdown link",
    (client) => {
      const node = element(MCP_INSTALL_COMPONENT, [
        { type: "mdxJsxAttribute", name: "client", value: client },
      ]);
      expect(stringified(node)).toEqual({ text: mcpInstallMarkdown(client) });
    },
  );

  it("leaves an install link for an unknown client and every other component alone", () => {
    const unknown = element(MCP_INSTALL_COMPONENT, [
      { type: "mdxJsxAttribute", name: "client", value: "zed" },
    ]);
    expect(stringified(unknown)).toBeUndefined();
    expect(stringified(element("Callout"))).toBeUndefined();
    expect(stringified({ type: "paragraph", children: [] })).toBeUndefined();
  });

  it("reaches a banner nested inside another node", () => {
    const banner = element(START_HERE_COMPONENT);
    remarkAgentEntryMarkdown()({
      type: "root",
      children: [{ type: "blockquote", children: [banner] }],
    });
    expect(banner.data?._stringify).toEqual({ text: START_HERE_MARKDOWN });
  });
});
