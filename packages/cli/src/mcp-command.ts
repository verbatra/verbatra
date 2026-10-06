import { resolve } from "node:path";
import type { McpServerHandle, McpStopCause } from "@verbatra/mcp";
import { z } from "zod";
import { CliUsageError } from "./cli-usage-error.js";
import { loadEnvFiles, loadProjectEnvFiles } from "./env.js";
import { renderError, toRenderableError } from "./render.js";
import {
  failedSession,
  isModuleMissing,
  resolveBooleanFlag,
  step,
  watchForStop,
} from "./session-command-support.js";
import type { StopCause } from "./stoppable-session.js";
import {
  DEFAULT_TERMINAL_SETTINGS,
  resolveTerminalMode,
  type TerminalSettings,
} from "./terminal-mode.js";
import type { CliDeps, McpModule, Session, Streams } from "./types.js";
import { createUi, type Ui } from "./ui.js";

const NOT_INSTALLED_HINT =
  "Verbatra's MCP server requires @verbatra/mcp. Run it without the CLI with: npx -y @verbatra/mcp, or install it alongside the CLI with: npm install --save-dev @verbatra/mcp";

const MCP_SPECIFIER_PATTERN = /['"]@verbatra\/mcp['"]/;

const mcpOptsSchema = z.object({
  cwd: z.string().optional(),
  config: z.string().optional(),
  allowSpend: z.boolean().optional(),
  redactValues: z.boolean().optional(),
});

type McpOpts = z.infer<typeof mcpOptsSchema>;

const ALLOW_SPEND_ENV_VAR = "VERBATRA_MCP_ALLOW_SPEND";

const REDACT_VALUES_ENV_VAR = "VERBATRA_MCP_REDACT_VALUES";

const CLI_LAUNCH_ARGS = ["verbatra", "mcp"] as const;

const FALLBACK_READY_LINE = "verbatra MCP server running on stdio";

const MCP_STOP_CAUSES = {
  ended: "stdin-closed",
  requested: "signal",
} as const satisfies Record<StopCause, McpStopCause>;

function announceReady(ui: Ui, mcpModule: McpModule, root: string, server: McpServerHandle): void {
  const { projectLabel, mcpReadyLine, mcpTerminalHint, mcpUnconfiguredHint } = mcpModule;
  if (projectLabel === undefined || mcpReadyLine === undefined) {
    ui.line(FALLBACK_READY_LINE);
    return;
  }
  ui.line(
    mcpReadyLine(projectLabel(root, process.cwd()), server.spend, server.valuesRedacted === true),
  );
  if (server.configured === false && mcpUnconfiguredHint !== undefined) {
    for (const line of mcpUnconfiguredHint()) {
      ui.line(line);
    }
  }
  if (ui.terminal.stdinIsTty && mcpTerminalHint !== undefined) {
    for (const line of mcpTerminalHint(CLI_LAUNCH_ARGS)) {
      ui.line(line);
    }
  }
}

function stoppedReporter(ui: Ui, mcpModule: McpModule): ((cause: StopCause) => void) | undefined {
  const { mcpStoppedLine } = mcpModule;
  return mcpStoppedLine === undefined
    ? undefined
    : (cause) => ui.line(mcpStoppedLine(MCP_STOP_CAUSES[cause]));
}

function redactionUnsupported(): CliUsageError {
  return new CliUsageError(
    "REDACTION_UNSUPPORTED",
    "--redact-values was requested, but the installed @verbatra/mcp does not confirm that it redacts values, so the server was stopped before serving anything.",
  );
}

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
  onSession?: (session: Session) => void,
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

  const cwd = mcpModule.resolveServerCwd?.(opts.cwd) ?? resolve(opts.cwd ?? process.cwd());
  try {
    loadProjectEnvFiles(cwd, opts.config);
  } catch (error) {
    streams.err(`${renderError(toRenderableError(error))}\n`);
    return failedSession(2);
  }
  const allowSpend = resolveBooleanFlag(opts.allowSpend, ALLOW_SPEND_ENV_VAR);
  const redactValues = resolveBooleanFlag(opts.redactValues, REDACT_VALUES_ENV_VAR);
  if (redactValues && mcpModule.MCP_CAPABILITIES?.valuesRedaction !== true) {
    ui.error(toRenderableError(redactionUnsupported()));
    return failedSession(2);
  }

  const server = await step(
    () =>
      mcpModule.startMcpServer({
        cwd,
        allowSpend,
        redactValues,
        onLog: (line) => streams.err(`${line}\n`),
        onProjectRootChange: (root) => {
          loadEnvFiles(root);
          ui.info(`project root is now ${root}`);
        },
        ...(opts.config !== undefined ? { configPath: opts.config } : {}),
      }),
    streams,
    () => undefined,
  );
  if (server === undefined) {
    return failedSession(2);
  }

  if (redactValues && server.valuesRedacted !== true) {
    await server.close().catch(() => undefined);
    ui.error(toRenderableError(redactionUnsupported()));
    return failedSession(2);
  }

  const root = server.projectRoot ?? cwd;
  const session = watchForStop(server, streams, stoppedReporter(ui, mcpModule));
  onSession?.(session);
  announceReady(ui, mcpModule, root, server);
  return session;
}
