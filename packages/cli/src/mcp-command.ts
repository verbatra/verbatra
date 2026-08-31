import { z } from "zod";
import { CliUsageError } from "./cli-usage-error.js";
import { loadEnvFiles } from "./env.js";
import { renderError, toRenderableError } from "./render.js";
import {
  failedSession,
  isModuleMissing,
  resolveBooleanFlag,
  step,
  watchForStop,
} from "./session-command-support.js";
import type { CliDeps, Session, Streams } from "./types.js";

const NOT_INSTALLED_HINT =
  "Verbatra's MCP server requires @verbatra/mcp. Install it with: pnpm add -D @verbatra/mcp";

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

export async function runMcp(rawOpts: unknown, deps: CliDeps, streams: Streams): Promise<Session> {
  let opts: McpOpts;
  try {
    opts = parseMcpOpts(rawOpts);
  } catch (error) {
    streams.err(`${renderError(toRenderableError(error))}\n`);
    return failedSession(2);
  }

  const cwd = opts.cwd ?? process.cwd();
  loadEnvFiles(cwd);
  const allowSpend = resolveBooleanFlag(opts.allowSpend, ALLOW_SPEND_ENV_VAR);

  const mcpModule = await step(
    () => deps.importMcp(),
    streams,
    (error) => (isModuleMissing(error, MCP_SPECIFIER_PATTERN) ? NOT_INSTALLED_HINT : undefined),
  );
  if (mcpModule === undefined) {
    return failedSession(2);
  }

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

  return watchForStop(server, streams);
}
