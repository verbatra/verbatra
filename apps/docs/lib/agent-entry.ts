import de from "../messages/de.json";
import en from "../messages/en.json";
import es from "../messages/es.json";
import fr from "../messages/fr.json";
import { AGENT_INIT_COMMAND } from "./install-commands";
import {
  isMcpInstallClient,
  MCP_INSTALL_COMPONENT,
  type McpInstallConfigs,
  mcpInstallClientName,
  mcpInstallMarkdown,
} from "./mcp-install-links";

export const START_HERE_COMPONENT = "StartHere";

export const START_HERE_PAGES = [
  "(agents)/start-with-ai",
  "(agents)/agent-recipes",
  "(agents)/connect-an-mcp-client",
] as const;

export const START_HERE_SILENT_IN_MARKDOWN = "(agents)/start-with-ai";

const MESSAGES = { en, de, es, fr } as const;

export type MarkdownLocale = keyof typeof MESSAGES;

export function markdownLocale(path: string | undefined): MarkdownLocale {
  const suffix = path?.match(/\.(de|es|fr)\.mdx$/)?.[1];
  return suffix === "de" || suffix === "es" || suffix === "fr" ? suffix : "en";
}

export function startHereMarkdown(locale: MarkdownLocale): string {
  return MESSAGES[locale].docs.startHere.markdown.replace("{command}", AGENT_INIT_COMMAND);
}

export function mcpInstallLabel(locale: MarkdownLocale, clientName: string): string {
  return MESSAGES[locale].docs.mcpInstall.label.replace("{client}", clientName);
}

function isSilentPage(path: string | undefined): boolean {
  return path?.includes(`${START_HERE_SILENT_IN_MARKDOWN}.`) ?? false;
}

type MdxAttribute = { type?: string; name?: string; value?: unknown };

type MdxNode = {
  type: string;
  name?: string | null;
  attributes?: MdxAttribute[];
  children?: MdxNode[];
  data?: Record<string, unknown>;
};

type MdxFile = { path?: string };

function attributeValue(node: MdxNode, name: string): unknown {
  return node.attributes?.find((attribute) => attribute.name === name)?.value;
}

function markdownFor(node: MdxNode, file: MdxFile, configs: McpInstallConfigs): string | undefined {
  if (node.type !== "mdxJsxFlowElement") return undefined;
  const locale = markdownLocale(file.path);
  if (node.name === START_HERE_COMPONENT) {
    return isSilentPage(file.path) ? "" : startHereMarkdown(locale);
  }
  if (node.name !== MCP_INSTALL_COMPONENT) return undefined;
  const client = attributeValue(node, "client");
  return isMcpInstallClient(client)
    ? mcpInstallMarkdown(
        configs,
        client,
        mcpInstallLabel(locale, mcpInstallClientName(configs, client)),
      )
    : undefined;
}

function stringifyAgentEntries(node: MdxNode, file: MdxFile, configs: McpInstallConfigs): void {
  const text = markdownFor(node, file, configs);
  if (text !== undefined) node.data = { ...node.data, _stringify: { text } };
  for (const child of node.children ?? []) stringifyAgentEntries(child, file, configs);
}

async function loadMcpInstallConfigs(): Promise<McpInstallConfigs> {
  const { AGENT_CLIENT_CONFIGS } = await import("@verbatra/cli");
  return AGENT_CLIENT_CONFIGS;
}

export function remarkAgentEntryMarkdown() {
  return async (root: MdxNode, file: MdxFile = {}): Promise<void> =>
    stringifyAgentEntries(root, file, await loadMcpInstallConfigs());
}
