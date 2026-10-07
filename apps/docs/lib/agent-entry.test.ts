import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { AGENT_CLIENT_CONFIGS } from "@verbatra/cli";
import { describe, expect, it, vi } from "vitest";
import {
  CLI_MODULE,
  type MarkdownLocale,
  markdownLocale,
  mcpInstallConfigsFrom,
  mcpInstallLabel,
  remarkAgentEntryMarkdown,
  STALE_CLI_BUILD_MESSAGE,
  START_HERE_COMPONENT,
  START_HERE_PAGES,
  START_HERE_SILENT_IN_MARKDOWN,
  startHereMarkdown,
} from "./agent-entry";
import { AGENT_INIT_COMMAND, NPM_INSTALL_COMMAND } from "./install-commands";
import { MCP_INSTALL_COMPONENT, mcpInstallMarkdown } from "./mcp-install-links";

const DOCS_DIR = fileURLToPath(new URL("../", import.meta.url));
const CONTENT_DIR = join(DOCS_DIR, "content/docs");
const LOCALE_SUFFIXES = ["", ".de", ".es", ".fr"] as const;
const LOCALES: readonly MarkdownLocale[] = ["en", "de", "es", "fr"];
const START_HERE_ELEMENT = `<${START_HERE_COMPONENT} />`;
const FRONTMATTER = /^---\n[\s\S]*?\n---\n/;
const FENCE = /```[a-z]*\n([\s\S]*?)```/g;
const CONNECT_PAGE = "content/docs/(agents)/connect-an-mcp-client";
const STACK_TEMPLATE = "content/templates/stack-quickstart";
const VSCODE_BUTTON = `<${MCP_INSTALL_COMPONENT} client="vscode" />`;

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

async function stringified(node: Node, path?: string): Promise<unknown> {
  await remarkAgentEntryMarkdown()(
    { type: "root", children: [node] },
    path === undefined ? {} : { path },
  );
  return node.data?._stringify;
}

async function bannerMarkdown(slug: string, suffix: string): Promise<string> {
  const path = join(CONTENT_DIR, `${slug}${suffix}.mdx`);
  const text = await stringified(element(START_HERE_COMPONENT), path);
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
    async (slug, suffix) => {
      const markdown = await bannerMarkdown(slug, suffix);
      expect(markdown).not.toContain("```");
      expect(markdown).not.toMatch(/^\s*npx /m);
    },
  );

  it.each(LOCALE_SUFFIXES)(
    "leaves start-with-ai%s.md to its own steps, whose first runnable command installs the CLI",
    async (suffix) => {
      expect(await bannerMarkdown(START_HERE_SILENT_IN_MARKDOWN, suffix)).toBe("");
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

  it("writes the sentence in the page's own locale", async () => {
    expect(await bannerMarkdown("(agents)/connect-an-mcp-client", ".de")).toBe(
      startHereMarkdown("de"),
    );
    expect(await bannerMarkdown("(agents)/agent-recipes", "")).toBe(startHereMarkdown("en"));
    expect(markdownLocale(undefined)).toBe("en");
    expect(markdownLocale("/x/page.fr.mdx")).toBe("fr");
  });
});

describe("the agent setup command", () => {
  it("is the one command the docs recommend for wiring a coding agent", () => {
    expect(AGENT_INIT_COMMAND).toBe("npx @verbatra/cli init --agent");
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

  it("reaches components/docs-home.tsx through the shared prompt button in the agent tip", () => {
    const home = docsFile("components/docs-home.tsx");
    expect(home).toContain('import { PromptCopyButton } from "@/components/ai-setup-prompt";');
    expect(home).toMatch(/export function DocsHomeAgentTip[\s\S]*?<PromptCopyButton/);
  });

  it.each(LOCALE_SUFFIXES)(
    "puts the agent tip and a quickstart tab in the header of index%s.mdx",
    (suffix) => {
      const page = docsFile(`content/docs/index${suffix}.mdx`);
      const header = page.slice(page.indexOf("<DocsHomeHeader"), page.indexOf("</DocsHomeHeader>"));
      expect(header).toContain("<DocsHomeAgentTip ");
      expect(header).toMatch(/<DocsHomeTabs\n[\s\S]*?href: "\/docs\/quickstart"/);
    },
  );

  it("reaches components/landing-hero.tsx through the shared prompt button and the install command", () => {
    const hero = docsFile("components/landing-hero.tsx");
    expect(hero).toContain('import { PromptCopyButton } from "@/components/ai-setup-prompt";');
    expect(hero).toContain("<PromptCopyButton");
    expect(hero).toMatch(
      /import \{[^}]*\bNPM_INSTALL_COMMAND\b[^}]*\} from "@\/lib\/install-commands";/,
    );
    expect(hero).toContain("command={NPM_INSTALL_COMMAND}");
  });
});

describe("the install button", () => {
  it.each(LOCALE_SUFFIXES)(
    "sits in the VS Code section of connect-an-mcp-client%s.mdx, with no Cursor button anywhere on it",
    (suffix) => {
      const mdx = docsFile(`${CONNECT_PAGE}${suffix}.mdx`);
      const vscode = mdx.indexOf("## VS Code");
      const copilot = mdx.indexOf("## GitHub Copilot");
      const vscodeButton = mdx.indexOf(VSCODE_BUTTON);
      expect(vscode).toBeLessThan(vscodeButton);
      expect(vscodeButton).toBeLessThan(copilot);
      expect(mdx.split(VSCODE_BUTTON)).toHaveLength(2);
      expect(mdx).not.toContain('client="cursor"');
    },
  );

  it.each(LOCALE_SUFFIXES)(
    "follows the init --agent explanation as the alternative route in stack-quickstart%s.mdx",
    (suffix) => {
      const template = docsFile(`${STACK_TEMPLATE}${suffix}.mdx`);
      const command = template.indexOf(`\`\`\`bash\n${AGENT_INIT_COMMAND}\n\`\`\``);
      const button = template.indexOf(VSCODE_BUTTON);
      const explanation = template.indexOf("/docs/cli/init#", command);
      expect(command).toBeGreaterThan(-1);
      expect(explanation).toBeGreaterThan(command);
      expect(button).toBeGreaterThan(explanation);
      expect(template.split(VSCODE_BUTTON)).toHaveLength(2);
      expect(template).not.toMatch(/McpInstallLinks|client="cursor"/);
    },
  );
});

describe("remarkAgentEntryMarkdown", () => {
  it("writes the VS Code install link as a localized Markdown link", async () => {
    const node = element(MCP_INSTALL_COMPONENT, [
      { type: "mdxJsxAttribute", name: "client", value: "vscode" },
    ]);
    expect(await stringified(node, "/x/page.es.mdx")).toEqual({
      text: mcpInstallMarkdown(AGENT_CLIENT_CONFIGS, "vscode", mcpInstallLabel("es", "VS Code")),
    });
    expect(mcpInstallLabel("es", "VS Code")).not.toContain("{client}");
  });

  it("leaves an install link for an unknown client and every other component alone", async () => {
    const unknown = element(MCP_INSTALL_COMPONENT, [
      { type: "mdxJsxAttribute", name: "client", value: "cursor" },
    ]);
    expect(await stringified(unknown)).toBeUndefined();
    expect(await stringified(element("Callout"))).toBeUndefined();
    expect(await stringified({ type: "paragraph", children: [] })).toBeUndefined();
  });

  it("reaches a banner nested inside another node", async () => {
    const banner = element(START_HERE_COMPONENT);
    await remarkAgentEntryMarkdown()({
      type: "root",
      children: [{ type: "blockquote", children: [banner] }],
    });
    expect(banner.data?._stringify).toEqual({ text: startHereMarkdown("en") });
  });
});

describe("the CLI agent configs the install link is built from", () => {
  it.each([{}, { AGENT_CLIENT_CONFIGS: undefined }, { AGENT_CLIENT_CONFIGS: { claude: {} } }])(
    "fail with the build command, not a property read on undefined, when the @verbatra/cli dist predates them (%j)",
    (cli) => {
      expect(() => mcpInstallConfigsFrom(cli)).toThrow(STALE_CLI_BUILD_MESSAGE);
    },
  );

  it("name the command that rebuilds the dist", () => {
    expect(STALE_CLI_BUILD_MESSAGE).toContain("pnpm turbo run build --filter=@verbatra/docs^...");
  });

  it("come from the current @verbatra/cli build", () => {
    expect(mcpInstallConfigsFrom({ AGENT_CLIENT_CONFIGS })).toBe(AGENT_CLIENT_CONFIGS);
  });

  it("register the @verbatra/cli entry as a compile dependency, so a rebuilt dist recompiles the page instead of replaying a cached failure", async () => {
    const addDependency = vi.fn();
    await remarkAgentEntryMarkdown()(
      { type: "root", children: [] },
      { path: "/x/page.de.mdx", data: { _compiler: { addDependency } } },
    );
    expect(addDependency).toHaveBeenCalledWith(fileURLToPath(import.meta.resolve(CLI_MODULE)));
    expect(addDependency.mock.calls[0]?.[0]).toMatch(/packages[\\/]cli[\\/]dist[\\/]lib\.js$/);
  });
});
