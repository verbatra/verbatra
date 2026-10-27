import { randomBytes } from "node:crypto";
import { isMachineTranslationEnabled, resolveProjectRoot } from "@verbatra/sdk";
import { z } from "zod";
import { CliUsageError } from "./cli-usage-error.js";
import { loadEnvFiles } from "./env.js";
import { renderError, toRenderableError } from "./render.js";
import { PRESS_CTRL_C, studioAgentToolsLine, studioSpendLine } from "./session-banners.js";
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
import { createUi, type Ui } from "./ui.js";

const TOKEN_BYTES = 32;

const NOT_INSTALLED_HINT =
  "Verbatra Studio requires @verbatra/studio. Install it alongside the CLI with: npm install --save-dev @verbatra/studio, or run both without installing with: npx -y -p @verbatra/cli -p @verbatra/studio verbatra studio";

const STUDIO_SPECIFIER_PATTERN = /['"]@verbatra\/studio['"]/;

const studioOptsSchema = z.object({
  cwd: z.string().optional(),
  config: z.string().optional(),
  port: z.coerce.number().int().min(1).max(65535).optional(),
  allowSpend: z.boolean().optional(),
  exposeAgentTools: z.boolean().optional(),
  verbose: z.boolean().optional(),
});

type StudioOpts = z.infer<typeof studioOptsSchema>;

const ALLOW_SPEND_ENV_VAR = "VERBATRA_STUDIO_ALLOW_SPEND";

function portInUseHint(error: unknown): string | undefined {
  if (!(error instanceof Error) || !("code" in error) || error.code !== "PORT_IN_USE") {
    return undefined;
  }
  return renderError({
    code: String(error.code),
    message: `${error.message}. Pass --port <n> to use another port, or stop the process that holds it.`,
  });
}

const AGENT_TOOLS_ENV_VAR = "VERBATRA_STUDIO_AGENT_TOOLS";

const STUDIO_0_5_REQUEST_LOG_LINE = /^[A-Z]+ \S+ \d{3}$/;

function isStudio05RequestLogLine(line: string): boolean {
  return STUDIO_0_5_REQUEST_LOG_LINE.test(line);
}

const SERVER_ERROR_LINE = /^studio error: /;

const TOKEN_QUERY = /token=[0-9a-fA-F]+/g;

const MASKED_TOKEN = "[REDACTED]";

function masked(line: string, token: string): string {
  return line.replaceAll(token, MASKED_TOKEN).replace(TOKEN_QUERY, `token=${MASKED_TOKEN}`);
}

function serverOutputForwarder(
  ui: Ui,
  token: string,
  verbose: boolean,
  isRequestLogLine: (line: string) => boolean,
): (line: string) => void {
  return (line) => {
    if (SERVER_ERROR_LINE.test(line)) {
      ui.warn(masked(line, token));
    } else if (verbose && isRequestLogLine(line)) {
      ui.line(masked(line, token));
    }
  };
}

const INVALID_PORT_MESSAGE = "The --port option must be an integer between 1 and 65535.";

function parseStudioOpts(rawOpts: unknown): StudioOpts {
  const result = studioOptsSchema.safeParse(rawOpts);
  if (!result.success) {
    throw new CliUsageError("INVALID_PORT", INVALID_PORT_MESSAGE);
  }
  return result.data;
}

export async function runStudio(
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
  let opts: StudioOpts;
  try {
    opts = parseStudioOpts(rawOpts);
  } catch (error) {
    streams.err(`${renderError(toRenderableError(error))}\n`);
    return failedSession(2);
  }

  const cwd = opts.cwd ?? process.cwd();
  try {
    loadEnvFiles(cwd, opts.config);
  } catch (error) {
    streams.err(`${renderError(toRenderableError(error))}\n`);
    return failedSession(2);
  }
  const spend = resolveBooleanFlag(opts.allowSpend, ALLOW_SPEND_ENV_VAR);
  const exposeAgentTools = resolveBooleanFlag(opts.exposeAgentTools, AGENT_TOOLS_ENV_VAR);

  const config = await step(
    () =>
      deps.loadConfigWithMeta({
        cwd,
        ...(opts.config !== undefined ? { configPath: opts.config } : {}),
      }),
    streams,
    () => undefined,
  );
  if (config === undefined) {
    return failedSession(2);
  }
  const root = resolveProjectRoot(config.source, cwd);

  const studioModule = await step(
    () => deps.importStudio(),
    streams,
    (error) => (isModuleMissing(error, STUDIO_SPECIFIER_PATTERN) ? NOT_INSTALLED_HINT : undefined),
  );
  if (studioModule === undefined) {
    return failedSession(2);
  }

  const token = randomBytes(TOKEN_BYTES).toString("hex");
  const server = await step(
    () =>
      studioModule.startStudioServer({
        loader: () => Promise.resolve(config),
        token,
        cwd: root,
        output: serverOutputForwarder(
          ui,
          token,
          opts.verbose === true,
          studioModule.isRequestLogLine ?? isStudio05RequestLogLine,
        ),
        spend,
        exposeAgentTools,
        ...(opts.port !== undefined ? { port: opts.port } : {}),
      }),
    streams,
    portInUseHint,
  );
  if (server === undefined) {
    return failedSession(2);
  }

  streams.out(`Verbatra Studio running at ${server.url}?token=${token}\n`);
  ui.info(studioSpendLine(spend, isMachineTranslationEnabled(config.config)));
  ui.info(studioAgentToolsLine(exposeAgentTools));
  if (ui.terminal.stdinIsTty) {
    ui.info(PRESS_CTRL_C);
  }

  return watchForStop(server, streams, () => ui.info("Studio stopped"));
}
