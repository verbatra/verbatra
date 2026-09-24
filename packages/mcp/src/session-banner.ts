import { realpathSync } from "node:fs";
import { isAbsolute, relative, sep } from "node:path";

export const MCP_DOCS_URL = "https://verbatra.kreitz-webdev.de/docs/cli/mcp";

export type StopCause = "stdin-closed" | "signal";

function realPath(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

export function projectLabel(cwd: string, base: string): string {
  const inside = relative(realPath(base), realPath(cwd));
  if (inside === "") {
    return ".";
  }
  const outside = inside === ".." || inside.startsWith(`..${sep}`) || isAbsolute(inside);
  return outside ? cwd : inside;
}

export function readyLines(
  project: string,
  allowSpend: boolean,
  stdinIsTty: boolean,
): readonly string[] {
  const ready = `verbatra MCP server running on stdio (project ${project}, spend tools ${allowSpend ? "on" : "off"})`;
  if (!stdinIsTty) {
    return [ready];
  }
  return [
    ready,
    "This server talks MCP over stdin and stdout and is meant to be launched by an MCP client.",
    `  add it to a client:  command "npx", args ["-y", "@verbatra/mcp"]  (${MCP_DOCS_URL})`,
    "  inspect it:          npx @modelcontextprotocol/inspector npx -y @verbatra/mcp",
    "Press Ctrl-C to stop.",
  ];
}

const STOP_REASONS: Record<StopCause, string> = {
  "stdin-closed": "client closed stdin",
  signal: "interrupted",
};

export function stoppedLine(cause: StopCause): string {
  return `verbatra MCP server stopped (${STOP_REASONS[cause]})`;
}
