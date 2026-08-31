import { z } from "zod";
import { CliUsageError } from "./cli-usage-error.js";
import { loadEnvFiles } from "./env.js";
import { renderError, toRenderableError } from "./render.js";
import { stoppableSession } from "./stoppable-session.js";
import type { CliDeps, McpSession, Streams } from "./types.js";

const NOT_INSTALLED_HINT =
  "Verbatra's MCP server requires @verbatra/mcp. Install it with: pnpm add -D @verbatra/mcp";

const MCP_SPECIFIER_PATTERN = /['"]@verbatra\/mcp['"]/;

function isMcpPackageMissing(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const code = (error as { code?: unknown }).code;
  return code === "ERR_MODULE_NOT_FOUND" && MCP_SPECIFIER_PATTERN.test(error.message);
}

const mcpOptsSchema = z.object({
  cwd: z.string().optional(),
  config: z.string().optional(),
  allowSpend: z.boolean().optional(),
});

type McpOpts = z.infer<typeof mcpOptsSchema>;

const ALLOW_SPEND_ENV_VAR = "VERBATRA_MCP_ALLOW_SPEND";

const TRUTHY_ENV_VALUES = new Set(["1", "true", "yes", "on"]);

function isEnvValueTruthy(value: string | undefined): boolean {
  return value !== undefined && TRUTHY_ENV_VALUES.has(value.trim().toLowerCase());
}

function resolveSpendCapability(opts: McpOpts): boolean {
  if (opts.allowSpend !== undefined) {
    return opts.allowSpend;
  }
  return isEnvValueTruthy(process.env[ALLOW_SPEND_ENV_VAR]);
}

function parseMcpOpts(rawOpts: unknown): McpOpts {
  const result = mcpOptsSchema.safeParse(rawOpts);
  if (!result.success) {
    throw new CliUsageError("USAGE_ERROR", "Invalid options passed to the mcp command.");
  }
  return result.data;
}

async function step<T>(
  action: () => Promise<T>,
  streams: Streams,
  hint: (error: unknown) => string | undefined,
): Promise<T | undefined> {
  try {
    return await action();
  } catch (error) {
    streams.err(`${hint(error) ?? renderError(toRenderableError(error))}\n`);
    return undefined;
  }
}

function failed(code: number): McpSession {
  return { done: Promise.resolve(code), requestStop: () => {} };
}

function watchForStop(server: { close(): Promise<void> }, streams: Streams): McpSession {
  return stoppableSession({
    getController: () => Promise.resolve({ stop: () => server.close() }),
    onFailure: (error) => {
      streams.err(`${renderError(toRenderableError(error))}\n`);
      return 1;
    },
  });
}

export async function runMcp(
  rawOpts: unknown,
  deps: CliDeps,
  streams: Streams,
): Promise<McpSession> {
  let opts: McpOpts;
  try {
    opts = parseMcpOpts(rawOpts);
  } catch (error) {
    streams.err(`${renderError(toRenderableError(error))}\n`);
    return failed(2);
  }

  const cwd = opts.cwd ?? process.cwd();
  loadEnvFiles(cwd);
  const allowSpend = resolveSpendCapability(opts);

  const mcpModule = await step(
    () => deps.importMcp(),
    streams,
    (error) => (isMcpPackageMissing(error) ? NOT_INSTALLED_HINT : undefined),
  );
  if (mcpModule === undefined) {
    return failed(2);
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
    return failed(2);
  }

  return watchForStop(server, streams);
}
