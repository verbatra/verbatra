import { AI_SETUP_PROMPT_MARKDOWN } from "./ai-setup-prompt";
import { AGENT_INIT_COMMAND } from "./install-commands";
import {
  isMcpInstallClient,
  MCP_INSTALL_ALL_COMPONENT,
  MCP_INSTALL_COMPONENT,
  mcpInstallAllMarkdown,
  mcpInstallMarkdown,
} from "./mcp-install-links";

export const START_HERE_COMPONENT = "StartHere";

export const START_HERE_PAGES = [
  "(agents)/start-with-ai",
  "(agents)/agent-recipes",
  "(agents)/connect-an-mcp-client",
  "(agents)/agent-tools-in-studio",
  "cli/mcp",
] as const;

export const START_HERE_MARKDOWN = `\`\`\`bash\n${AGENT_INIT_COMMAND}\n\`\`\`\n\n${AI_SETUP_PROMPT_MARKDOWN}`;

type MdxAttribute = { type?: string; name?: string; value?: unknown };

type MdxNode = {
  type: string;
  name?: string | null;
  attributes?: MdxAttribute[];
  children?: MdxNode[];
  data?: Record<string, unknown>;
};

function attributeValue(node: MdxNode, name: string): unknown {
  return node.attributes?.find((attribute) => attribute.name === name)?.value;
}

function markdownFor(node: MdxNode): string | undefined {
  if (node.type !== "mdxJsxFlowElement") return undefined;
  if (node.name === START_HERE_COMPONENT) return START_HERE_MARKDOWN;
  if (node.name === MCP_INSTALL_ALL_COMPONENT) return mcpInstallAllMarkdown();
  if (node.name !== MCP_INSTALL_COMPONENT) return undefined;
  const client = attributeValue(node, "client");
  return isMcpInstallClient(client) ? mcpInstallMarkdown(client) : undefined;
}

function stringifyAgentEntries(node: MdxNode): void {
  const text = markdownFor(node);
  if (text !== undefined) node.data = { ...node.data, _stringify: { text } };
  for (const child of node.children ?? []) stringifyAgentEntries(child);
}

export function remarkAgentEntryMarkdown() {
  return (root: MdxNode) => stringifyAgentEntries(root);
}
