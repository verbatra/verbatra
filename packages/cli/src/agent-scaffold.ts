import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import {
  AGENT_CLIENT_CONFIGS,
  type AgentClientConfig,
  type AgentClientId,
  type ClientSelectedBy,
  type JsonAgentClientConfig,
  type SelectedClient,
  selectClients,
  type TomlAgentClientConfig,
  verbatraPluginSetting,
} from "./agent-clients.js";
import { AGENT_INSTRUCTIONS } from "./agent-instructions.js";
import { CliUsageError } from "./cli-usage-error.js";
import {
  appendMember,
  memberValueSpan,
  objectMembers,
  repeatedKey,
  rootObjectSpan,
} from "./json-text.js";
import {
  entryExists,
  escapesProject,
  isDirectoryEntry,
  isRegularFile,
  LINK_OUTSIDE_PROJECT,
  resolvesToFile,
  symlinkOnPath,
} from "./project-paths.js";
import { renderTomlTable, scanToml, type TomlStatement } from "./toml-text.js";

export const MARKER_START = "<!-- verbatra:start -->";
export const MARKER_END = "<!-- verbatra:end -->";

const INSTRUCTION_FILES = ["AGENTS.md", "CLAUDE.md"] as const;

export type AgentFileAction = "created" | "updated" | "unchanged";

export type McpServerState = "added" | "present" | "differs";

export type ClientServerState = McpServerState | "skipped";

export interface PlannedAgentFile {
  readonly path: string;
  readonly action: AgentFileAction;
  readonly content: string;
}

export interface PlannedClientWrite extends PlannedAgentFile {
  readonly server: McpServerState;
}

export type ClientSkipReason = "plugin" | "symlink";

export interface PlannedClient {
  readonly id: AgentClientId;
  readonly file: string;
  readonly server: ClientServerState;
  readonly reason: ClientSkipReason | null;
  readonly link: string | undefined;
  readonly selectedBy: ClientSelectedBy;
  readonly markers: readonly string[];
  readonly write: PlannedClientWrite | undefined;
}

export interface AgentScaffoldPlan {
  readonly instructions: PlannedAgentFile;
  readonly clients: readonly PlannedClient[];
  readonly pluginSetting: string | undefined;
  readonly vscodeHint: boolean;
}

interface Merged {
  readonly content: string;
  readonly action: AgentFileAction;
}

type JsonObject = Record<string, unknown>;

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

function agentFileInvalid(message: string): CliUsageError {
  return new CliUsageError("AGENT_FILE_INVALID", message);
}

function brokenMarkers(file: string): CliUsageError {
  return agentFileInvalid(
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

function invalidMcpConfig(file: string, reason: string): CliUsageError {
  return agentFileInvalid(
    `${file} ${reason}, so init cannot add the verbatra server to it. Fix or remove it and run init again. Nothing was written.`,
  );
}

function parseMcpConfig(client: JsonAgentClientConfig, existing: string): JsonObject {
  let parsed: unknown;
  try {
    parsed = JSON.parse(existing);
  } catch {
    throw invalidMcpConfig(
      client.file,
      "is not plain JSON (init never rewrites a file with comments or trailing commas)",
    );
  }
  if (!isJsonObject(parsed)) {
    throw invalidMcpConfig(client.file, "does not hold a JSON object");
  }
  const servers = parsed[client.serversKey];
  if (servers !== undefined && !isJsonObject(servers)) {
    throw invalidMcpConfig(
      client.file,
      `has a value under ${client.serversKey} that is not an object`,
    );
  }
  assertNoRepeatedKeys(client, existing);
  return parsed;
}

function assertNoRepeatedKeys(client: JsonAgentClientConfig, existing: string): void {
  const rootMembers = objectMembers(existing, rootObjectSpan(existing));
  if (repeatedKey(rootMembers) !== undefined) {
    throw invalidMcpConfig(client.file, "repeats a key at its top level");
  }
  const servers = rootMembers.find((member) => member.key === client.serversKey);
  if (servers !== undefined && repeatedKey(objectMembers(existing, servers)) !== undefined) {
    throw invalidMcpConfig(client.file, `repeats a server name under ${client.serversKey}`);
  }
}

const DEFAULT_INDENT_UNIT = "  ";

function indentUnit(existing: string): string {
  return /^([ \t]+)\S/m.exec(existing)?.[1] ?? DEFAULT_INDENT_UNIT;
}

function freshConfig(client: JsonAgentClientConfig): string {
  const config = { [client.serversKey]: { [client.serverName]: client.server } };
  return `${JSON.stringify(config, null, DEFAULT_INDENT_UNIT)}\n`;
}

function reserialized(config: JsonObject, client: JsonAgentClientConfig, existing: string): string {
  const servers = config[client.serversKey];
  const merged = {
    ...config,
    [client.serversKey]: {
      ...(isJsonObject(servers) ? servers : {}),
      [client.serverName]: client.server,
    },
  };
  const eol = lineEnding(existing);
  const body = JSON.stringify(merged, null, indentUnit(existing)).replaceAll("\n", eol);
  return /\r?\n$/.test(existing) ? `${body}${eol}` : body;
}

function withServerInserted(
  config: JsonObject,
  client: JsonAgentClientConfig,
  existing: string,
): string {
  if (!existing.includes("\n")) {
    return reserialized(config, client, existing);
  }
  const layout = { unit: indentUnit(existing), eol: lineEnding(existing) };
  const root = rootObjectSpan(existing);
  const servers = memberValueSpan(existing, root, client.serversKey);
  const inserted =
    servers === undefined
      ? appendMember(
          existing,
          root,
          { key: client.serversKey, value: { [client.serverName]: client.server } },
          layout,
        )
      : appendMember(existing, servers, { key: client.serverName, value: client.server }, layout);
  return inserted ?? reserialized(config, client, existing);
}

interface McpMerged extends Merged {
  readonly server: McpServerState;
}

export function mergeMcpConfig(
  client: JsonAgentClientConfig,
  existing: string | undefined,
): McpMerged {
  if (existing === undefined) {
    return { content: freshConfig(client), action: "created", server: "added" };
  }
  if (existing.trim() === "") {
    return { content: freshConfig(client), action: "updated", server: "added" };
  }
  const config = parseMcpConfig(client, existing);
  const servers = config[client.serversKey];
  if (isJsonObject(servers) && Object.hasOwn(servers, client.serverName)) {
    const same = isDeepStrictEqual(servers[client.serverName], client.server);
    return { content: existing, action: "unchanged", server: same ? "present" : "differs" };
  }
  return {
    content: withServerInserted(config, client, existing),
    action: "updated",
    server: "added",
  };
}

function startsWithPath(path: readonly string[], prefix: readonly string[]): boolean {
  return prefix.every((part, index) => path[index] === part);
}

function samePath(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && startsWithPath(a, b);
}

function tomlRefusal(
  client: TomlAgentClientConfig,
  statement: TomlStatement,
  table: readonly string[],
): string | undefined {
  if (statement.kind !== "value") {
    return statement.kind === "array-table" && startsWithPath(table, statement.path)
      ? `declares ${statement.path.join(".")} as an array of tables`
      : undefined;
  }
  if (statement.table.length === 0 && statement.path[0] === client.serversKey) {
    return `sets ${client.serversKey} with an inline table or dotted keys instead of [${table.join(".")}] tables`;
  }
  return startsWithPath(statement.path, table) && !startsWithPath(statement.table, table)
    ? `defines the ${client.serverName} server with an inline table or dotted keys instead of a [${table.join(".")}] table`
    : undefined;
}

function repeatedTomlEntry(
  statements: readonly TomlStatement[],
  table: readonly string[],
): string | undefined {
  const headers = statements.filter(
    (statement) => statement.kind === "table" && samePath(statement.path, table),
  );
  if (headers.length > 1) {
    return `repeats the [${table.join(".")}] table`;
  }
  const keys = statements.flatMap((statement) =>
    statement.kind === "value" && samePath(statement.table, table)
      ? [statement.path.join(".")]
      : [],
  );
  return new Set(keys).size === keys.length ? undefined : `repeats a key in [${table.join(".")}]`;
}

function tomlEntryState(
  client: TomlAgentClientConfig,
  statements: readonly TomlStatement[],
): McpServerState | undefined {
  const table = [client.serversKey, client.serverName];
  const reason =
    statements.map((statement) => tomlRefusal(client, statement, table)).find(Boolean) ??
    repeatedTomlEntry(statements, table);
  if (reason !== undefined) {
    throw invalidMcpConfig(client.file, reason);
  }
  const entry = statements.filter((statement) => startsWithPath(statement.path, table));
  if (entry.length === 0) {
    return undefined;
  }
  const fields = entry.flatMap((statement) =>
    statement.kind === "value" && samePath(statement.table, table)
      ? [[statement.path.slice(table.length).join("."), statement.value] as const]
      : [],
  );
  const nested = entry.some((statement) => statement.path.length > table.length + 1);
  const same = !nested && isDeepStrictEqual(Object.fromEntries(fields), { ...client.server });
  return same ? "present" : "differs";
}

function tomlServerTable(client: TomlAgentClientConfig, eol: string): string {
  return renderTomlTable([client.serversKey, client.serverName], client.server, eol);
}

export function tomlServerBlock(client: TomlAgentClientConfig): string {
  return tomlServerTable(client, "\n");
}

export function mergeTomlConfig(
  client: TomlAgentClientConfig,
  existing: string | undefined,
): McpMerged {
  if (existing === undefined) {
    return { content: tomlServerBlock(client), action: "created", server: "added" };
  }
  const eol = lineEnding(existing);
  if (existing.trim() === "") {
    return { content: tomlServerTable(client, eol), action: "updated", server: "added" };
  }
  const statements = scanToml(existing);
  if (statements === undefined) {
    throw invalidMcpConfig(
      client.file,
      "is not TOML init can read safely, such as a file with an unterminated string, array or table header",
    );
  }
  const state = tomlEntryState(client, statements);
  if (state !== undefined) {
    return { content: existing, action: "unchanged", server: state };
  }
  const block = tomlServerTable(client, eol);
  return {
    content: `${existing}${appendSeparator(existing, eol)}${block}`,
    action: "updated",
    server: "added",
  };
}

export function mergeClientConfig(
  client: AgentClientConfig,
  existing: string | undefined,
): McpMerged {
  return client.format === "toml"
    ? mergeTomlConfig(client, existing)
    : mergeMcpConfig(client, existing);
}

function unsafeClientPath(file: string, reason: string): CliUsageError {
  return agentFileInvalid(
    `${file} ${reason}, so init will not write through it. Replace it with a plain file or directory inside the project, or wire the client by hand, and run init again. Nothing was written.`,
  );
}

function unsafeInstructionPath(file: string, reason: string): CliUsageError {
  return agentFileInvalid(
    `${file} ${reason}, so init will not read or write through it. Replace it with a plain file inside the project and run init again. Nothing was written.`,
  );
}

function assertWritableClientFile(cwd: string, file: string): void {
  const link = symlinkOnPath(cwd, file);
  if (link !== undefined) {
    throw unsafeClientPath(file, `sits behind the symbolic link ${link}`);
  }
  const directory = dirname(file);
  if (directory !== "." && entryExists(cwd, directory) && !isDirectoryEntry(cwd, directory)) {
    throw unsafeClientPath(file, `needs ${directory} to be a directory, but it is not`);
  }
  if (entryExists(cwd, file) && !isRegularFile(cwd, file)) {
    throw unsafeClientPath(file, "is not a regular file");
  }
}

function readClientFile(cwd: string, file: string): string | undefined {
  assertWritableClientFile(cwd, file);
  return entryExists(cwd, file) ? readFileSync(resolve(cwd, file), "utf8") : undefined;
}

function readInstructionFile(cwd: string, file: string): string | undefined {
  if (!entryExists(cwd, file)) {
    return undefined;
  }
  if (escapesProject(cwd, file)) {
    throw unsafeInstructionPath(file, LINK_OUTSIDE_PROJECT);
  }
  if (!resolvesToFile(cwd, file)) {
    throw unsafeInstructionPath(file, "is not a regular file");
  }
  return readFileSync(resolve(cwd, file), "utf8");
}

function instructionsFile(cwd: string): { readonly path: string; readonly existing?: string } {
  const present = INSTRUCTION_FILES.flatMap((path) => {
    const existing = readInstructionFile(cwd, path);
    return existing === undefined ? [] : [{ path, existing }];
  });
  const marked = present.find((file) => file.existing.includes(MARKER_START));
  return marked ?? present[0] ?? { path: INSTRUCTION_FILES[0] };
}

function planClient(
  cwd: string,
  selected: SelectedClient,
  pluginSetting: string | undefined,
): PlannedClient {
  const client = AGENT_CLIENT_CONFIGS[selected.id];
  const base = { ...selected, file: client.file };
  if (selected.id === "claude" && pluginSetting !== undefined) {
    return { ...base, server: "skipped", reason: "plugin", link: undefined, write: undefined };
  }
  const link = selected.selectedBy === "flag" ? undefined : symlinkOnPath(cwd, client.file);
  if (link !== undefined) {
    return { ...base, server: "skipped", reason: "symlink", link, write: undefined };
  }
  const merged = mergeClientConfig(client, readClientFile(cwd, client.file));
  return {
    ...base,
    server: merged.server,
    reason: null,
    link: undefined,
    write: {
      path: client.file,
      action: merged.action,
      content: merged.content,
      server: merged.server,
    },
  };
}

export function planAgentScaffold(
  cwd: string,
  flagged?: readonly AgentClientId[],
): AgentScaffoldPlan {
  const target = instructionsFile(cwd);
  const instructions = mergeInstructions(target.path, target.existing);
  const selection = selectClients(cwd, flagged);
  const wiresClaude = selection.clients.some((client) => client.id === "claude");
  const pluginSetting = wiresClaude ? verbatraPluginSetting(cwd) : undefined;
  return {
    instructions: { path: target.path, ...instructions },
    clients: selection.clients.map((client) => planClient(cwd, client, pluginSetting)),
    pluginSetting,
    vscodeHint: selection.vscodeHint,
  };
}
