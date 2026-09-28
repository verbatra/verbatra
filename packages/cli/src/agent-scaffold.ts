import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { AGENT_INSTRUCTIONS } from "./agent-instructions.js";
import { CliUsageError } from "./cli-usage-error.js";

export const MARKER_START = "<!-- verbatra:start -->";
export const MARKER_END = "<!-- verbatra:end -->";
export const MCP_CONFIG_FILE = ".mcp.json";
export const MCP_SERVER_ENTRY = {
  type: "stdio",
  command: "npx",
  args: ["-y", "@verbatra/mcp"],
} as const;

const MCP_SERVER_NAME = "verbatra";
const INSTRUCTION_FILES = ["AGENTS.md", "CLAUDE.md"] as const;
const DEFAULT_INDENT = 2;

export type AgentFileAction = "created" | "updated" | "unchanged";

export type McpServerState = "added" | "present" | "differs";

export interface PlannedAgentFile {
  readonly path: string;
  readonly action: AgentFileAction;
  readonly content: string;
}

export interface AgentScaffoldPlan {
  readonly instructions: PlannedAgentFile;
  readonly mcp: PlannedAgentFile;
  readonly mcpServer: McpServerState;
}

interface Merged {
  readonly content: string;
  readonly action: AgentFileAction;
}

type JsonObject = Record<string, unknown>;

function readIfPresent(path: string): string | undefined {
  return existsSync(path) ? readFileSync(path, "utf8") : undefined;
}

function lineEnding(content: string): string {
  return content.includes("\r\n") ? "\r\n" : "\n";
}

function markedSection(eol: string): string {
  return [MARKER_START, ...AGENT_INSTRUCTIONS.split("\n"), MARKER_END].join(eol);
}

function occurrences(content: string, token: string): number {
  return content.split(token).length - 1;
}

function appendSeparator(content: string, eol: string): string {
  if (content === "" || content.endsWith(`${eol}${eol}`)) {
    return "";
  }
  return content.endsWith(eol) ? eol : `${eol}${eol}`;
}

function brokenMarkers(file: string): CliUsageError {
  return new CliUsageError(
    "AGENT_FILE_INVALID",
    `${file} has an unpaired or repeated ${MARKER_START} / ${MARKER_END} marker, so init cannot tell which part it wrote. Leave exactly one start marker before one end marker, or remove both, and run init again. ${file} was not changed.`,
  );
}

function changed(existing: string, content: string): Merged {
  return { content, action: content === existing ? "unchanged" : "updated" };
}

export function mergeInstructions(file: string, existing: string | undefined): Merged {
  if (existing === undefined) {
    return { content: `${markedSection("\n")}\n`, action: "created" };
  }
  const eol = lineEnding(existing);
  const starts = occurrences(existing, MARKER_START);
  const ends = occurrences(existing, MARKER_END);
  if (starts === 0 && ends === 0) {
    const section = `${markedSection(eol)}${eol}`;
    return changed(existing, `${existing}${appendSeparator(existing, eol)}${section}`);
  }
  const start = existing.indexOf(MARKER_START);
  const end = existing.indexOf(MARKER_END);
  if (starts !== 1 || ends !== 1 || end < start) {
    throw brokenMarkers(file);
  }
  const before = existing.slice(0, start);
  const after = existing.slice(end + MARKER_END.length);
  return changed(existing, `${before}${markedSection(eol)}${after}`);
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalidMcpConfig(reason: string): CliUsageError {
  return new CliUsageError(
    "AGENT_FILE_INVALID",
    `${MCP_CONFIG_FILE} ${reason}, so init cannot add the verbatra server to it. Fix or remove it and run init again. ${MCP_CONFIG_FILE} was not changed.`,
  );
}

function parseMcpConfig(existing: string): JsonObject {
  let parsed: unknown;
  try {
    parsed = JSON.parse(existing);
  } catch {
    throw invalidMcpConfig("is not valid JSON");
  }
  if (!isJsonObject(parsed)) {
    throw invalidMcpConfig("does not hold a JSON object");
  }
  if (parsed.mcpServers !== undefined && !isJsonObject(parsed.mcpServers)) {
    throw invalidMcpConfig("has an mcpServers value that is not an object");
  }
  return parsed;
}

function indentOf(existing: string): string | number {
  return /^([ \t]+)\S/m.exec(existing)?.[1] ?? DEFAULT_INDENT;
}

function serialize(value: JsonObject, indent: string | number, eol: string, trailing: boolean) {
  const body = JSON.stringify(value, null, indent).replaceAll("\n", eol);
  return trailing ? `${body}${eol}` : body;
}

interface McpMerged extends Merged {
  readonly server: McpServerState;
}

export function mergeMcpConfig(existing: string | undefined): McpMerged {
  if (existing === undefined) {
    const content = serialize(
      { mcpServers: { [MCP_SERVER_NAME]: MCP_SERVER_ENTRY } },
      DEFAULT_INDENT,
      "\n",
      true,
    );
    return { content, action: "created", server: "added" };
  }
  const config = parseMcpConfig(existing);
  const servers: JsonObject = isJsonObject(config.mcpServers) ? config.mcpServers : {};
  if (Object.hasOwn(servers, MCP_SERVER_NAME)) {
    const same = isDeepStrictEqual(servers[MCP_SERVER_NAME], MCP_SERVER_ENTRY);
    return { content: existing, action: "unchanged", server: same ? "present" : "differs" };
  }
  const merged = { ...config, mcpServers: { ...servers, [MCP_SERVER_NAME]: MCP_SERVER_ENTRY } };
  const eol = lineEnding(existing);
  const content = serialize(merged, indentOf(existing), eol, /\r?\n$/.test(existing));
  return { content, action: "updated", server: "added" };
}

function instructionsFile(cwd: string): { readonly path: string; readonly existing?: string } {
  const present = INSTRUCTION_FILES.flatMap((path) => {
    const existing = readIfPresent(resolve(cwd, path));
    return existing === undefined ? [] : [{ path, existing }];
  });
  const marked = present.find((file) => file.existing.includes(MARKER_START));
  return marked ?? present[0] ?? { path: INSTRUCTION_FILES[0] };
}

export function planAgentScaffold(cwd: string): AgentScaffoldPlan {
  const target = instructionsFile(cwd);
  const instructions = mergeInstructions(target.path, target.existing);
  const mcp = mergeMcpConfig(readIfPresent(resolve(cwd, MCP_CONFIG_FILE)));
  return {
    instructions: { path: target.path, ...instructions },
    mcp: { path: MCP_CONFIG_FILE, content: mcp.content, action: mcp.action },
    mcpServer: mcp.server,
  };
}
