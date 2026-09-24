import { z } from "zod";
import { CliUsageError } from "./cli-usage-error.js";
import { loadEnvFiles } from "./env.js";
import { renderError, toRenderableError } from "./render.js";
import {
  MCP_TERMINAL_HINT,
  mcpReadyLine,
  mcpStoppedLine,
  projectLabel,
} from "./session-banners.js";
import {
  failedSession,
  isModuleMissing,
  resolveBooleanFlag,
  step,
  watchForStop,
} from "./session-command-support.js";
import {
  DEFAULT_TERMINAL_SETTINGS,
  resolveTerminalMode,
  type TerminalSettings,
} from "./terminal-mode.js";
import type { CliDeps, Session, Streams } from "./types.js";
import { createUi } from "./ui.js";

const NOT_INSTALLED_HINT =
  "Verbatra's MCP server requires @verbatra/mcp. Run it without the CLI with: npx -y @verbatra/mcp, or install it alongside the CLI with: npm install --save-dev @verbatra/mcp";

const MCP_SPECIFIER_PATTERN = /['"]@verbatra\/mcp['"]/;

const mcpOptsSchema = z.object({
  cwd: z.string().optional(),
  config: z.string().optional(),
  allowSpend: z.boolean().optional(),
});

type McpOpts = z.infer<typeof mcpOptsSchema>;

const ALLOW_SPEND_ENV_VAR = "VERBATRA_MCP_ALLOW_SPEND";

function parseMcpOpts(rawOpts: unknown): McpOpts {
  const result = mcpOptsSchema.safeParse(rawOpts);
  if (!result.success) {
    throw new CliUsageError("USAGE_ERROR", "Invalid options passed to the mcp command.");
  }
  return result.data;
}

export async function runMcp(
  rawOpts: unknown,
  deps: CliDeps,
  streams: Streams,
  settings: TerminalSettings = DEFAULT_TERMINAL_SETTINGS,
): Promise<Session> {
  const ui = createUi(
    streams,
    resolveTerminalMode(settings.facts, {
      json: false,
      quiet: settings.quiet,
      color: settings.color,
    }),
  );
  let opts: McpOpts;
  try {
    opts = parseMcpOpts(rawOpts);
  } catch (error) {
    streams.err(`${renderError(toRenderableError(error))}\n`);
    return failedSession(2);
  }

  const mcpModule = await step(
    () => deps.importMcp(),
    streams,
    (error) => (isModuleMissing(error, MCP_SPECIFIER_PATTERN) ? NOT_INSTALLED_HINT : undefined),
  );
  if (mcpModule === undefined) {
    return failedSession(2);
  }

  const cwd = mcpModule.resolveServerCwd?.(opts.cwd) ?? opts.cwd ?? process.cwd();
  try {
    loadEnvFiles(cwd);
  } catch (error) {
    streams.err(`${renderError(toRenderableError(error))}\n`);
    return failedSession(2);
  }
  const allowSpend = resolveBooleanFlag(opts.allowSpend, ALLOW_SPEND_ENV_VAR);

  const server = await step(
    () =>
      mcpModule.startMcpServer({
        cwd,
        allowSpend,
        onLog: (line) => streams.err(`${line}\n`),
        ...(opts.config !== undefined ? { configPath: opts.config } : {}),
      }),
    streams,
    () => undefined,
  );
  if (server === undefined) {
    return failedSession(2);
  }

  ui.line(mcpReadyLine(projectLabel(cwd, process.cwd()), allowSpend));
  if (ui.terminal.stdinIsTty) {
    for (const line of MCP_TERMINAL_HINT) {
      ui.line(line);
    }
  }
  return watchForStop(server, streams, (cause) => ui.line(mcpStoppedLine(cause)));
}
