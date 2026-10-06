import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  type MarkdownLocale,
  markdownLocale,
  mcpInstallLabel,
  remarkAgentEntryMarkdown,
  START_HERE_COMPONENT,
  START_HERE_PAGES,
  START_HERE_SILENT_IN_MARKDOWN,
  startHereMarkdown,
} from "./agent-entry";
import { AGENT_INIT_COMMAND, NPM_INSTALL_COMMAND } from "./install-commands";
import {
  MCP_INSTALL_ALL_COMPONENT,
  MCP_INSTALL_COMPONENT,
  mcpInstallMarkdown,
} from "./mcp-install-links";

const DOCS_DIR = fileURLToPath(new URL("../", import.meta.url));
const CONTENT_DIR = join(DOCS_DIR, "content/docs");
const LOCALE_SUFFIXES = ["", ".de", ".es", ".fr"] as const;
const LOCALES: readonly MarkdownLocale[] = ["en", "de", "es", "fr"];
const START_HERE_ELEMENT = `<${START_HERE_COMPONENT} />`;
const FRONTMATTER = /^---\n[\s\S]*?\n---\n/;
const FENCE = /```[a-z]*\n([\s\S]*?)```/g;
const CONNECT_PAGE = "content/docs/(agents)/connect-an-mcp-client";
const STACK_TEMPLATE = "content/templates/stack-quickstart";

function docsFile(relative: string): string {
  return readFileSync(join(DOCS_DIR, relative), "utf8");
}

function page(slug: string, suffix: string): string {
  return readFileSync(join(CONTENT_DIR, `${slug}${suffix}.mdx`), "utf8");
}

function filesUnder(dir: string, pattern: RegExp): string[] {
  return readdirSync(join(DOCS_DIR, dir), { recursive: true, encoding: "utf8" })
    .filter((file) => pattern.test(file) && !/\.test\.(ts|tsx|mjs)$/.test(file))
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

function stringified(node: Node, path?: string): unknown {
  remarkAgentEntryMarkdown()(
    { type: "root", children: [node] },
    path === undefined ? {} : { path },
  );
  return node.data?._stringify;
}

function bannerMarkdown(slug: string, suffix: string): string {
  const path = join(CONTENT_DIR, `${slug}${suffix}.mdx`);
  const text = stringified(element(START_HERE_COMPONENT), path);
  return typeof text === "object" && text !== null && "text" in text ? String(text.text) : "";
}

const BANNER_CASES = START_HERE_PAGES.flatMap((slug) =>
  LOCALE_SUFFIXES.map((suffix) => [slug, suffix] as const),
);

describe("the Start here banner", () => {
  it.each(BANNER_CASES)("opens %s%s.mdx, once, before any prose", (slug, suffix) => {
    const mdx = page(slug, suffix);
    const body = mdx.replace(FRONTMATTER, "");
    expect(body.startsWith(`${START_HERE_ELEMENT}\n\n`)).toBe(true);
    expect(mdx.split(START_HERE_ELEMENT)).toHaveLength(2);
  });

  it("sits on the agent guides only, never on a reference page or the browser-agent page", () => {
    const pages = readdirSync(CONTENT_DIR, { recursive: true, encoding: "utf8" }).filter(
      (file) =>
        file.endsWith(".mdx") &&
        readFileSync(join(CONTENT_DIR, file), "utf8").includes(START_HERE_ELEMENT),
    );
    const expected = START_HERE_PAGES.flatMap((slug) =>
      LOCALE_SUFFIXES.map((suffix) => `${slug}${suffix}.mdx`),
    );
    expect(pages.sort()).toEqual(expected.sort());
    expect(START_HERE_PAGES).not.toContain("cli/mcp");
    expect(START_HERE_PAGES).not.toContain("(agents)/agent-tools-in-studio");
  });

  it.each(BANNER_CASES)(
    "gives the Markdown output of %s%s no runnable fence, so an agent never runs npx before the CLI is installed",
    (slug, suffix) => {
      const markdown = bannerMarkdown(slug, suffix);
      expect(markdown).not.toContain("```");
      expect(markdown).not.toMatch(/^\s*npx /m);
    },
  );

  it.each(LOCALE_SUFFIXES)(
    "leaves start-with-ai%s.md to its own steps, whose first runnable command installs the CLI",
    (suffix) => {
      expect(bannerMarkdown(START_HERE_SILENT_IN_MARKDOWN, suffix)).toBe("");
      const body = page(START_HERE_SILENT_IN_MARKDOWN, suffix).replace(FRONTMATTER, "");
      const firstFence = [...body.matchAll(FENCE)][0]?.[1]?.trim();
      expect(firstFence).toBe(NPM_INSTALL_COMMAND);
    },
  );

  it.each(LOCALES)(
    "states the command as a conditional sentence in %s, naming the CLI it needs",
    (locale) => {
      const sentence = startHereMarkdown(locale);
      expect(sentence).toContain(`\`${AGENT_INIT_COMMAND}\``);
      expect(sentence).toContain("`@verbatra/cli`");
      expect(sentence).not.toContain("{command}");
    },
  );

  it("writes the sentence in the page's own locale", () => {
    expect(bannerMarkdown("(agents)/connect-an-mcp-client", ".de")).toBe(startHereMarkdown("de"));
    expect(bannerMarkdown("(agents)/agent-recipes", "")).toBe(startHereMarkdown("en"));
    expect(markdownLocale(undefined)).toBe("en");
    expect(markdownLocale("/x/page.fr.mdx")).toBe("fr");
  });
});

describe("the agent setup command", () => {
  it("is the one command the docs recommend for wiring a coding agent", () => {
    expect(AGENT_INIT_COMMAND).toBe("npx verbatra init --agent");
  });

  it("is written out only in lib/install-commands.ts among the app code, messages and scripts", () => {
    const files = [
      ...filesUnder("app", /\.(ts|tsx)$/),
      ...filesUnder("components", /\.(ts|tsx)$/),
      ...filesUnder("lib", /\.(ts|tsx)$/),
      ...filesUnder("messages", /\.json$/),
      ...filesUnder("scripts", /\.(mjs|ts)$/),
    ];
    const writers = files.filter((file) => docsFile(file).includes("init --agent"));
    expect(writers).toEqual(["lib/install-commands.ts"]);
  });

  it.each(
    [CONNECT_PAGE, STACK_TEMPLATE].flatMap((source) =>
      LOCALE_SUFFIXES.map((suffix) => `${source}${suffix}.mdx`),
    ),
  )("is the exact command the agent step in %s runs", (file) => {
    expect(docsFile(file)).toContain(`\`\`\`bash\n${AGENT_INIT_COMMAND}\n\`\`\``);
  });

  it.each(["components/landing-hero.tsx", "components/docs-home.tsx"])(
    "reaches %s through the one install box",
    (file) => {
      expect(docsFile(file)).toContain(
        'import { PackageInstall } from "@/components/landing/package-install";',
      );
    },
  );
});

describe("the install buttons", () => {
  it.each(LOCALE_SUFFIXES)(
    "sit in the Cursor and VS Code sections of connect-an-mcp-client%s.mdx",
    (suffix) => {
      const mdx = docsFile(`${CONNECT_PAGE}${suffix}.mdx`);
      const cursor = mdx.indexOf("## Cursor");
      const vscode = mdx.indexOf("## VS Code");
      const copilot = mdx.indexOf("## GitHub Copilot");
      const cursorButton = mdx.indexOf(`<${MCP_INSTALL_COMPONENT} client="cursor" />`);
      const vscodeButton = mdx.indexOf(`<${MCP_INSTALL_COMPONENT} client="vscode" />`);
      expect(cursor).toBeLessThan(cursorButton);
      expect(cursorButton).toBeLessThan(vscode);
      expect(vscode).toBeLessThan(vscodeButton);
      expect(vscodeButton).toBeLessThan(copilot);
    },
  );

  it.each(LOCALE_SUFFIXES)(
    "follow the init --agent explanation as the alternative route in stack-quickstart%s.mdx",
    (suffix) => {
      const template = docsFile(`${STACK_TEMPLATE}${suffix}.mdx`);
      const command = template.indexOf(`\`\`\`bash\n${AGENT_INIT_COMMAND}\n\`\`\``);
      const buttons = template.indexOf(`<${MCP_INSTALL_ALL_COMPONENT} />`);
      const explanation = template.indexOf("/docs/cli/init#", command);
      expect(command).toBeGreaterThan(-1);
      expect(explanation).toBeGreaterThan(command);
      expect(buttons).toBeGreaterThan(explanation);
      expect(template.split(`<${MCP_INSTALL_ALL_COMPONENT} />`)).toHaveLength(2);
    },
  );
});

describe("remarkAgentEntryMarkdown", () => {
  it.each(["cursor", "vscode"] as const)(
    "writes the %s install link as a localized Markdown link",
    (client) => {
      const node = element(MCP_INSTALL_COMPONENT, [
        { type: "mdxJsxAttribute", name: "client", value: client },
      ]);
      expect(stringified(node, "/x/page.es.mdx")).toEqual({
        text: mcpInstallMarkdown(client, mcpInstallLabel("es", client)),
      });
      expect(mcpInstallLabel("es", client)).not.toContain("{client}");
    },
  );

  it("writes both install links for the button pair", () => {
    expect(stringified(element(MCP_INSTALL_ALL_COMPONENT))).toEqual({
      text: `${mcpInstallMarkdown("cursor", mcpInstallLabel("en", "cursor"))} ${mcpInstallMarkdown("vscode", mcpInstallLabel("en", "vscode"))}`,
    });
  });

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
    expect(banner.data?._stringify).toEqual({ text: startHereMarkdown("en") });
  });
});
