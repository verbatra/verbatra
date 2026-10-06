import { CliUsageError } from "./cli-usage-error.js";
import {
  entryExists,
  isDirectoryEntry,
  isSymlinkEntry,
  readPlainProjectFile,
} from "./project-paths.js";

/**
 * The coding-agent clients `verbatra init --agent` can wire, in the order it reports them:
 * `claude` (Claude Code), `cursor` (Cursor) and `vscode` (VS Code). Each one is also a value of
 * `init --client`, next to `all`.
 */
export const AGENT_CLIENT_IDS = ["claude", "cursor", "vscode"] as const;

/** One of the {@link AGENT_CLIENT_IDS}. */
export type AgentClientId = (typeof AGENT_CLIENT_IDS)[number];

/** The verbatra MCP server entry `verbatra init --agent` writes into a client's config file. */
export interface AgentClientServer {
  /** The transport: always a local process speaking MCP over stdio. */
  readonly type: "stdio";
  /** The program the client starts. */
  readonly command: "npx";
  /** The program's arguments. Never `--allow-spend`, so the spend tools stay hidden. */
  readonly args: readonly string[];
}

/** The project-scoped MCP configuration `verbatra init --agent` writes for one client. */
export interface AgentClientConfig {
  /** The client's display name. */
  readonly name: string;
  /** The config file, relative to the project root, with `/` separators. */
  readonly file: string;
  /** The top-level key of that file that holds the server entries. */
  readonly serversKey: "mcpServers" | "servers";
  /** The name of the server entry under {@link AgentClientConfig.serversKey}. */
  readonly serverName: "verbatra";
  /** The server entry: spending off, with no `env` and no `inputs`. */
  readonly server: AgentClientServer;
}

/**
 * The exact MCP entry `verbatra init --agent` writes for each client, keyed by
 * {@link AgentClientId}. `file` is project-relative, the entry turns no spend tool on and names no
 * environment variable, and an existing `verbatra` entry is never changed.
 */
export const AGENT_CLIENT_CONFIGS = {
  claude: {
    name: "Claude Code",
    file: ".mcp.json",
    serversKey: "mcpServers",
    serverName: "verbatra",
    server: { type: "stdio", command: "npx", args: ["-y", "@verbatra/mcp"] },
  },
  cursor: {
    name: "Cursor",
    file: ".cursor/mcp.json",
    serversKey: "mcpServers",
    serverName: "verbatra",
    server: {
      type: "stdio",
      command: "npx",
      // biome-ignore lint/suspicious/noTemplateCurlyInString: Cursor expands this variable itself.
      args: ["-y", "@verbatra/mcp", "--cwd", "${workspaceFolder}"],
    },
  },
  vscode: {
    name: "VS Code",
    file: ".vscode/mcp.json",
    serversKey: "servers",
    serverName: "verbatra",
    server: { type: "stdio", command: "npx", args: ["-y", "@verbatra/mcp"] },
  },
} as const satisfies { readonly [id in AgentClientId]: AgentClientConfig };

export const CLIENT_FLAG_VALUES = [...AGENT_CLIENT_IDS, "all"] as const;

const CLIENT_MARKERS: { readonly [id in AgentClientId]: readonly string[] } = {
  claude: ["CLAUDE.md", ".claude/", ".mcp.json"],
  cursor: [".cursor/", ".cursorrules"],
  vscode: [".vscode/mcp.json"],
};

const CLAUDE_SETTINGS_FILES = [".claude/settings.json", ".claude/settings.local.json"] as const;
const VERBATRA_PLUGIN = "verbatra@verbatra";

export type ClientSelectedBy = "flag" | "markers" | "default";

export interface SelectedClient {
  readonly id: AgentClientId;
  readonly selectedBy: ClientSelectedBy;
  readonly markers: readonly string[];
}

export interface ClientSelection {
  readonly clients: readonly SelectedClient[];
  readonly vscodeHint: boolean;
}

function invalidClientOption(message: string): CliUsageError {
  return new CliUsageError("INVALID_OPTION", message, CLIENT_FLAG_VALUES);
}

function isClientFlagValue(value: string): value is (typeof CLIENT_FLAG_VALUES)[number] {
  return (CLIENT_FLAG_VALUES as readonly string[]).includes(value);
}

const CLIENT_CHOICES = `${AGENT_CLIENT_IDS.join(", ")}, or all`;

export function parseClientFlag(
  value: string | undefined,
  agent: boolean,
): readonly AgentClientId[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!agent) {
    throw invalidClientOption(
      "--client chooses the clients --agent wires, so it needs --agent. Add --agent, or drop --client.",
    );
  }
  const ids = value
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id !== "");
  if (ids.length === 0) {
    throw invalidClientOption(
      `--client was given no client. Pass ${CLIENT_CHOICES}, separated by commas.`,
    );
  }
  const unknown = ids.find((id) => !isClientFlagValue(id));
  if (unknown !== undefined) {
    throw invalidClientOption(
      `--client names ${JSON.stringify(unknown)}, which is not a client init can wire. Pass ${CLIENT_CHOICES}.`,
    );
  }
  return ids.includes("all") ? AGENT_CLIENT_IDS : AGENT_CLIENT_IDS.filter((id) => ids.includes(id));
}

function markerFound(cwd: string, marker: string): boolean {
  return marker.endsWith("/")
    ? isDirectoryEntry(cwd, marker.slice(0, -1)) || isSymlinkEntry(cwd, marker.slice(0, -1))
    : entryExists(cwd, marker);
}

function foundMarkers(cwd: string, id: AgentClientId): readonly string[] {
  return CLIENT_MARKERS[id].filter((marker) => markerFound(cwd, marker));
}

function pickClients(
  cwd: string,
  flagged: readonly AgentClientId[] | undefined,
): readonly SelectedClient[] {
  const found = AGENT_CLIENT_IDS.map((id) => ({ id, markers: foundMarkers(cwd, id) }));
  if (flagged !== undefined) {
    return found
      .filter((client) => flagged.includes(client.id))
      .map((client) => ({ ...client, selectedBy: "flag" as const }));
  }
  const marked = found.filter((client) => client.markers.length > 0);
  if (marked.length === 0) {
    return [{ id: "claude", markers: [], selectedBy: "default" }];
  }
  return marked.map((client) => ({ ...client, selectedBy: "markers" as const }));
}

export function selectClients(
  cwd: string,
  flagged: readonly AgentClientId[] | undefined,
): ClientSelection {
  const clients = pickClients(cwd, flagged);
  const vscodeHint =
    isDirectoryEntry(cwd, ".vscode") && !clients.some((client) => client.id === "vscode");
  return { clients, vscodeHint };
}

function enablesVerbatraPlugin(content: string): boolean {
  try {
    const settings: unknown = JSON.parse(content);
    if (typeof settings !== "object" || settings === null || !("enabledPlugins" in settings)) {
      return false;
    }
    const plugins: unknown = settings.enabledPlugins;
    return (
      typeof plugins === "object" &&
      plugins !== null &&
      Reflect.get(plugins, VERBATRA_PLUGIN) === true
    );
  } catch {
    return false;
  }
}

export function verbatraPluginSetting(cwd: string): string | undefined {
  return CLAUDE_SETTINGS_FILES.find((file) => {
    const content = readPlainProjectFile(cwd, file);
    return content !== undefined && enablesVerbatraPlugin(content);
  });
}
