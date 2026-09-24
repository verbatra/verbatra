import { realpathSync } from "node:fs";
import { isAbsolute, relative, sep } from "node:path";

export const MCP_DOCS_URL = "https://verbatra.kreitz-webdev.de/docs/cli/mcp";

/**
 * Why a stdio MCP server session ended: `stdin-closed` when the client closed stdin, `signal` when
 * the process was interrupted.
 */
export type McpStopCause = "stdin-closed" | "signal";

/**
 * The arguments `npx` is given to launch the server, as an MCP client config lists them: for
 * example `["-y", "@verbatra/mcp"]` for the standalone package or `["verbatra", "mcp"]` for the CLI.
 */
export type McpLaunchArgs = readonly string[];

function realPath(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

/**
 * Labels the project a server runs against for its ready line: `.` for the base directory itself,
 * a relative path for a directory inside it, and `cwd` unchanged for anything outside it. Symlinks
 * are resolved first, so a symlinked base still matches.
 *
 * @param cwd - The project root the server runs against.
 * @param base - The directory the label is relative to, usually `process.cwd()`.
 * @returns The label to pass to {@link mcpReadyLine}.
 */
export function projectLabel(cwd: string, base: string): string {
  const inside = relative(realPath(base), realPath(cwd));
  if (inside === "") {
    return ".";
  }
  const outside = inside === ".." || inside.startsWith(`..${sep}`) || isAbsolute(inside);
  return outside ? cwd : inside;
}

/**
 * Builds the one-line stderr notice a stdio MCP server prints once it is ready.
 *
 * @param project - The project label, from {@link projectLabel}.
 * @param allowSpend - Whether the provider-spending tools are advertised.
 * @returns The ready line, without a trailing newline.
 */
export function mcpReadyLine(project: string, allowSpend: boolean): string {
  return `verbatra MCP server running on stdio (project ${project}, spend tools ${allowSpend ? "on" : "off"})`;
}

/**
 * Builds the extra stderr lines for a person who started the server by hand in a terminal: how to
 * add it to an MCP client, how to inspect it, and how to stop it.
 *
 * @param launch - The `npx` arguments that launch the server, see {@link McpLaunchArgs}.
 * @returns The hint lines, each without a trailing newline.
 */
export function mcpTerminalHint(launch: McpLaunchArgs): readonly string[] {
  const args = launch.map((arg) => JSON.stringify(arg)).join(", ");
  return [
    "This server talks MCP over stdin and stdout and is meant to be launched by an MCP client.",
    `  add it to a client:  command "npx", args [${args}]  (${MCP_DOCS_URL})`,
    `  inspect it:          npx @modelcontextprotocol/inspector npx ${launch.join(" ")}`,
    "Press Ctrl-C to stop.",
  ];
}

const STOP_REASONS: Record<McpStopCause, string> = {
  "stdin-closed": "client closed stdin",
  signal: "interrupted",
};

/**
 * Builds the stderr notice a stdio MCP server prints once it has stopped.
 *
 * @param cause - Why the session ended.
 * @returns The stopped line, without a trailing newline.
 */
export function mcpStoppedLine(cause: McpStopCause): string {
  return `verbatra MCP server stopped (${STOP_REASONS[cause]})`;
}
