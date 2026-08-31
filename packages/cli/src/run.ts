import {
  DEFAULT_EXCHANGE_FORMAT,
  EXCHANGE_FORMATS,
  type ExchangeFormat,
  type LockWaitEvent,
  type ProgressEvent,
  type TranslateInput,
} from "@verbatra/sdk";
import { Command, CommanderError } from "commander";
import { z } from "zod";
import { CliUsageError } from "./cli-usage-error.js";
import { loadEnvFiles } from "./env.js";
import { appendMissingGitignoreEntries } from "./gitignore.js";
import { runInit } from "./init.js";
import { renderErrorEnvelope, renderSuccessEnvelope } from "./json-envelope.js";
import { runMcp } from "./mcp-command.js";
import { readPackageManifest } from "./package-manifest.js";
import { parsePositiveIntegerOption } from "./positive-integer-option.js";
import {
  renderCheckHuman,
  renderDiffHuman,
  renderDoctorHuman,
  renderError,
  renderExportHuman,
  renderHuman,
  renderLockWait,
  renderProgress,
  toRenderableError,
} from "./render.js";
import { runStudio } from "./studio-command.js";
import type { CliDeps, InitOpts, RunHooks, Streams } from "./types.js";
import { runWatch } from "./watch-session.js";

const CLI_VERSION = readPackageManifest().version;

interface SharedOpts {
  readonly cwd?: string;
  readonly config?: string;
}

const localeListSchema = z
  .string()
  .optional()
  .transform((value) =>
    value === undefined
      ? undefined
      : value
          .split(",")
          .map((entry) => entry.trim())
          .filter((entry) => entry.length > 0),
  );

const sharedCommandOptsSchema = z.object({
  cwd: z.string().optional(),
  config: z.string().optional(),
  json: z.boolean().optional(),
});

const translateOptsSchema = sharedCommandOptsSchema.extend({
  locales: localeListSchema,
  dryRun: z.boolean().optional(),
  prune: z.boolean().optional(),
  lockTimeout: z.string().optional(),
  concurrency: z.string().optional(),
  cache: z.boolean().optional(),
});

const watchOptsSchema = sharedCommandOptsSchema.extend({
  locales: localeListSchema,
  debounce: z.string().optional(),
  lockTimeout: z.string().optional(),
  concurrency: z.string().optional(),
  cache: z.boolean().optional(),
});
type WatchOpts = z.infer<typeof watchOptsSchema>;

const exchangeFormatSchema = z.string().optional();

const exportOptsSchema = sharedCommandOptsSchema.extend({
  out: z.string().optional(),
  locales: localeListSchema,
  includeUnchanged: z.boolean().optional(),
  format: exchangeFormatSchema,
});

const importOptsSchema = sharedCommandOptsSchema.extend({
  dryRun: z.boolean().optional(),
  format: exchangeFormatSchema,
});

const checkOptsSchema = sharedCommandOptsSchema.extend({
  locales: localeListSchema,
});

const diffOptsSchema = sharedCommandOptsSchema.extend({
  locales: localeListSchema,
});

function runExitCode(summary: {
  readonly partial: readonly string[];
  readonly failed: readonly string[];
}): number {
  return summary.failed.length > 0 || summary.partial.length > 0 ? 1 : 0;
}

interface CommandContext {
  readonly streams: Streams;
  readonly command: string | null;
  readonly json: boolean;
}

const jsonFlagSchema = z.object({ json: z.boolean().optional() });

function commandContext(command: string, rawOpts: unknown, streams: Streams): CommandContext {
  const parsed = jsonFlagSchema.safeParse(rawOpts);
  return { streams, command, json: parsed.success && parsed.data.json === true };
}

function renderFailureExit2(error: unknown, context: CommandContext): number {
  const renderable = toRenderableError(error);
  context.streams.err(`${renderError(renderable)}\n`);
  if (context.json) {
    context.streams.out(`${renderErrorEnvelope(context.command, renderable)}\n`);
  }
  return 2;
}

const USAGE_ERROR_CODE = "USAGE_ERROR";

function argvRequestsJson(argv: readonly string[]): boolean {
  return argv.includes("--json");
}

function resolveCommandName(program: Command, argv: readonly string[]): string | null {
  const names = new Set(program.commands.map((command) => command.name()));
  return argv.find((token) => names.has(token)) ?? null;
}

function renderUsageFailureExit2(
  error: CommanderError,
  program: Command,
  argv: readonly string[],
  streams: Streams,
): number {
  if (argvRequestsJson(argv)) {
    const envelope = renderErrorEnvelope(resolveCommandName(program, argv), {
      code: USAGE_ERROR_CODE,
      message: error.message,
    });
    streams.out(`${envelope}\n`);
  }
  return 2;
}

async function withParsedOpts<T>(
  parse: () => T,
  context: CommandContext,
  body: (opts: T) => Promise<number>,
): Promise<number> {
  let opts: T;
  try {
    opts = parse();
  } catch (error) {
    return renderFailureExit2(error, context);
  }
  return body(opts);
}

function parseLocaleCommandOpts<T extends { readonly locales?: readonly string[] | undefined }>(
  schema: z.ZodType<T>,
  rawOpts: unknown,
): T {
  const opts = schema.parse(rawOpts);
  if (opts.locales !== undefined && opts.locales.length === 0) {
    throw new CliUsageError(
      "INVALID_LOCALES",
      "The --locales option was provided but lists no locale. Pass a comma-separated list of " +
        "configured target locales, or omit --locales to use all of them.",
    );
  }
  return opts;
}

async function withLocaleOpts<T extends { readonly locales?: readonly string[] | undefined }>(
  schema: z.ZodType<T>,
  rawOpts: unknown,
  context: CommandContext,
  body: (opts: T) => Promise<number>,
): Promise<number> {
  return withParsedOpts(() => parseLocaleCommandOpts(schema, rawOpts), context, body);
}

function loadOptions(opts: SharedOpts, cwd: string): { cwd: string; configPath?: string } {
  return {
    cwd,
    ...(opts.config !== undefined ? { configPath: opts.config } : {}),
  };
}

async function withWholeRunErrors(
  deps: CliDeps,
  context: CommandContext,
  loadOpts: { cwd: string; configPath?: string },
  body: (config: Awaited<ReturnType<CliDeps["loadConfig"]>>) => Promise<number>,
  beforeLoad?: () => void,
): Promise<number> {
  try {
    beforeLoad?.();
    const config = await deps.loadConfig(loadOpts);
    return await body(config);
  } catch (error) {
    return renderFailureExit2(error, context);
  }
}

function parseDebounce(value: string | undefined): number | undefined {
  return parsePositiveIntegerOption(value, {
    code: "INVALID_DEBOUNCE",
    describe: "--debounce option must be a positive whole number of milliseconds",
    min: 1,
  });
}

const FORMAT_OPTION_DESCRIPTION = `handoff format: one of ${EXCHANGE_FORMATS.join(
  ", ",
)} (default ${DEFAULT_EXCHANGE_FORMAT})`;

function parseExchangeFormat(value: string | undefined): ExchangeFormat | undefined {
  if (value === undefined) {
    return undefined;
  }
  const format = EXCHANGE_FORMATS.find((candidate) => candidate === value);
  if (format === undefined) {
    throw new CliUsageError(
      "INVALID_FORMAT",
      `The --format option must be one of ${EXCHANGE_FORMATS.join(", ")}, got "${value}".`,
    );
  }
  return format;
}

function parseLockTimeout(value: string | undefined): number | undefined {
  const seconds = parsePositiveIntegerOption(value, {
    code: "INVALID_LOCK_TIMEOUT",
    describe: "--lock-timeout option must be a positive whole number of seconds",
    min: 1,
  });
  return seconds === undefined ? undefined : seconds * 1000;
}

function parseConcurrency(value: string | undefined): number | undefined {
  return parsePositiveIntegerOption(value, {
    code: "INVALID_CONCURRENCY",
    describe: "--concurrency option must be a positive whole number",
    min: 1,
  });
}

interface ParsedTranslateOpts extends z.infer<typeof translateOptsSchema> {
  readonly lockAcquireTimeoutMs?: number;
  readonly concurrencyValue?: number;
}

function parseTranslateCommandOpts(rawOpts: unknown): ParsedTranslateOpts {
  const opts = parseLocaleCommandOpts(translateOptsSchema, rawOpts);
  const lockAcquireTimeoutMs = parseLockTimeout(opts.lockTimeout);
  const concurrencyValue = parseConcurrency(opts.concurrency);
  return {
    ...opts,
    ...(lockAcquireTimeoutMs !== undefined ? { lockAcquireTimeoutMs } : {}),
    ...(concurrencyValue !== undefined ? { concurrencyValue } : {}),
  };
}

function lockWaitReporter(streams: Streams, json: boolean): (event: LockWaitEvent) => void {
  return (event) => {
    streams.err(`${renderLockWait(event, json)}\n`);
  };
}

function progressReporter(streams: Streams, json: boolean): (event: ProgressEvent) => void {
  return (event) => {
    streams.err(`${renderProgress(event, json)}\n`);
  };
}

function buildTranslateInput(
  opts: ParsedTranslateOpts,
  config: TranslateInput["config"],
  cwd: string,
  streams: Streams,
): TranslateInput {
  const json = opts.json === true;
  return {
    config,
    cwd,
    onLockWait: lockWaitReporter(streams, json),
    onProgress: progressReporter(streams, json),
    ...(opts.locales !== undefined ? { locales: opts.locales } : {}),
    ...(opts.dryRun === true ? { dryRun: true } : {}),
    ...(opts.prune === true ? { prune: true } : {}),
    ...(opts.lockAcquireTimeoutMs !== undefined
      ? { lockAcquireTimeoutMs: opts.lockAcquireTimeoutMs }
      : {}),
    ...(opts.concurrencyValue !== undefined ? { concurrency: opts.concurrencyValue } : {}),
    ...(opts.cache === false ? { cache: false } : {}),
  };
}

export async function runTranslate(
  rawOpts: unknown,
  deps: CliDeps,
  streams: Streams,
): Promise<number> {
  const context = commandContext("translate", rawOpts, streams);
  return withParsedOpts(
    () => parseTranslateCommandOpts(rawOpts),
    context,
    async (opts) => {
      const cwd = opts.cwd ?? process.cwd();
      appendMissingGitignoreEntries(cwd, opts.dryRun);
      return withWholeRunErrors(
        deps,
        context,
        loadOptions(opts.config !== undefined ? { config: opts.config } : {}, cwd),
        async (config) => {
          const summary = await deps.translate(buildTranslateInput(opts, config, cwd, streams));
          streams.out(
            context.json
              ? `${renderSuccessEnvelope("translate", summary)}\n`
              : `${renderHuman(summary)}\n`,
          );
          return runExitCode(summary);
        },
        () => loadEnvFiles(cwd),
      );
    },
  );
}

interface ParsedWatchOpts extends WatchOpts {
  readonly debounceMs?: number;
  readonly lockAcquireTimeoutMs?: number;
  readonly concurrencyValue?: number;
}

function parseWatchCommandOpts(rawOpts: unknown): ParsedWatchOpts {
  const opts = parseLocaleCommandOpts(watchOptsSchema, rawOpts);
  const debounceMs = parseDebounce(opts.debounce);
  const lockAcquireTimeoutMs = parseLockTimeout(opts.lockTimeout);
  const concurrencyValue = parseConcurrency(opts.concurrency);
  return {
    ...opts,
    ...(debounceMs !== undefined ? { debounceMs } : {}),
    ...(lockAcquireTimeoutMs !== undefined ? { lockAcquireTimeoutMs } : {}),
    ...(concurrencyValue !== undefined ? { concurrencyValue } : {}),
  };
}

async function runWatchCommand(
  rawOpts: unknown,
  deps: CliDeps,
  streams: Streams,
  hooks: RunHooks,
): Promise<number> {
  const context = commandContext("watch", rawOpts, streams);
  return withParsedOpts(
    () => parseWatchCommandOpts(rawOpts),
    context,
    async (opts) => {
      const cwd = opts.cwd ?? process.cwd();
      appendMissingGitignoreEntries(cwd);
      let config: Awaited<ReturnType<CliDeps["loadConfig"]>>;
      try {
        loadEnvFiles(cwd);
        config = await deps.loadConfig(
          loadOptions(opts.config !== undefined ? { config: opts.config } : {}, cwd),
        );
      } catch (error) {
        return renderFailureExit2(error, context);
      }
      const session = runWatch(
        {
          config,
          json: context.json,
          cwd,
          ...(opts.locales !== undefined ? { locales: opts.locales } : {}),
          ...(opts.debounceMs !== undefined ? { debounceMs: opts.debounceMs } : {}),
          ...(opts.lockAcquireTimeoutMs !== undefined
            ? { lockAcquireTimeoutMs: opts.lockAcquireTimeoutMs }
            : {}),
          ...(opts.concurrencyValue !== undefined ? { concurrency: opts.concurrencyValue } : {}),
          ...(opts.cache === false ? { cache: false } : {}),
        },
        deps,
        streams,
      );
      hooks.onWatchSession?.(session);
      return session.done;
    },
  );
}

async function runStudioCommand(
  rawOpts: unknown,
  deps: CliDeps,
  streams: Streams,
  hooks: RunHooks,
): Promise<number> {
  const session = await runStudio(rawOpts, deps, streams);
  hooks.onStudioSession?.(session);
  return session.done;
}

async function runMcpCommand(
  rawOpts: unknown,
  deps: CliDeps,
  streams: Streams,
  hooks: RunHooks,
): Promise<number> {
  const session = await runMcp(rawOpts, deps, streams);
  hooks.onMcpSession?.(session);
  return session.done;
}

async function runExport(rawOpts: unknown, deps: CliDeps, streams: Streams): Promise<number> {
  const context = commandContext("export", rawOpts, streams);
  return withParsedOpts(
    () => {
      const opts = parseLocaleCommandOpts(exportOptsSchema, rawOpts);
      return { ...opts, format: parseExchangeFormat(opts.format) };
    },
    context,
    async (opts) => {
      const cwd = opts.cwd ?? process.cwd();
      return withWholeRunErrors(
        deps,
        context,
        loadOptions(opts.config !== undefined ? { config: opts.config } : {}, cwd),
        async (config) => {
          const result = await deps.exportWorkbook({
            config,
            cwd,
            ...(opts.out !== undefined ? { out: opts.out } : {}),
            ...(opts.locales !== undefined ? { locales: opts.locales } : {}),
            ...(opts.includeUnchanged === true ? { includeUnchanged: true } : {}),
            ...(opts.format !== undefined ? { format: opts.format } : {}),
          });
          streams.out(
            context.json
              ? `${renderSuccessEnvelope("export", result)}\n`
              : `${renderExportHuman(result)}\n`,
          );
          return 0;
        },
      );
    },
  );
}

export async function runImport(
  workbook: string,
  rawOpts: unknown,
  deps: CliDeps,
  streams: Streams,
): Promise<number> {
  const context = commandContext("import", rawOpts, streams);
  return withParsedOpts(
    () => {
      const opts = importOptsSchema.parse(rawOpts);
      return { ...opts, format: parseExchangeFormat(opts.format) };
    },
    context,
    async (opts) => {
      const cwd = opts.cwd ?? process.cwd();
      appendMissingGitignoreEntries(cwd, opts.dryRun);
      return withWholeRunErrors(
        deps,
        context,
        loadOptions(opts.config !== undefined ? { config: opts.config } : {}, cwd),
        async (config) => {
          const summary = await deps.importWorkbook({
            config,
            workbook,
            cwd,
            ...(opts.dryRun === true ? { dryRun: true } : {}),
            ...(opts.format !== undefined ? { format: opts.format } : {}),
          });
          streams.out(
            context.json
              ? `${renderSuccessEnvelope("import", summary)}\n`
              : `${renderHuman(summary, "import")}\n`,
          );
          return runExitCode(summary);
        },
      );
    },
  );
}

async function runCheck(rawOpts: unknown, deps: CliDeps, streams: Streams): Promise<number> {
  const context = commandContext("check", rawOpts, streams);
  return withLocaleOpts(checkOptsSchema, rawOpts, context, async (opts) => {
    const cwd = opts.cwd ?? process.cwd();
    return withWholeRunErrors(
      deps,
      context,
      loadOptions(opts.config !== undefined ? { config: opts.config } : {}, cwd),
      async (config) => {
        const summary = await deps.check({
          config,
          cwd,
          ...(opts.locales !== undefined ? { locales: opts.locales } : {}),
        });
        streams.out(
          context.json
            ? `${renderSuccessEnvelope("check", summary)}\n`
            : `${renderCheckHuman(summary)}\n`,
        );
        return summary.inSync ? 0 : 1;
      },
    );
  });
}

async function runDiff(rawOpts: unknown, deps: CliDeps, streams: Streams): Promise<number> {
  const context = commandContext("diff", rawOpts, streams);
  return withLocaleOpts(diffOptsSchema, rawOpts, context, async (opts) => {
    const cwd = opts.cwd ?? process.cwd();
    return withWholeRunErrors(
      deps,
      context,
      loadOptions(opts.config !== undefined ? { config: opts.config } : {}, cwd),
      async (config) => {
        const summary = await deps.diff({
          config,
          cwd,
          ...(opts.locales !== undefined ? { locales: opts.locales } : {}),
        });
        streams.out(
          context.json
            ? `${renderSuccessEnvelope("diff", summary)}\n`
            : `${renderDiffHuman(summary)}\n`,
        );
        return summary.hasPendingChanges ? 1 : 0;
      },
    );
  });
}

async function runDoctor(rawOpts: unknown, deps: CliDeps, streams: Streams): Promise<number> {
  const context = commandContext("doctor", rawOpts, streams);
  return withParsedOpts(
    () => sharedCommandOptsSchema.parse(rawOpts),
    context,
    async (opts) => {
      const cwd = opts.cwd ?? process.cwd();
      try {
        loadEnvFiles(cwd);
        const result = await deps.doctor({
          cwd,
          ...(opts.config !== undefined ? { configPath: opts.config } : {}),
        });
        streams.out(
          context.json
            ? `${renderSuccessEnvelope("doctor", result)}\n`
            : `${renderDoctorHuman(result)}\n`,
        );
        return result.ok ? 0 : 1;
      } catch (error) {
        return renderFailureExit2(error, context);
      }
    },
  );
}

interface ProgramContext {
  readonly deps: CliDeps;
  readonly streams: Streams;
  readonly hooks: RunHooks;
  readonly setCode: (code: number) => void;
}

function registerTranslateCommand(program: Command, ctx: ProgramContext): void {
  program
    .command("translate")
    .description("Translate every target locale once, then exit")
    .option("--cwd <path>", "resolve config and locale files from this directory")
    .option("--config <path>", "load this config file instead of searching for one")
    .option("--locales <list>", "comma-separated subset of target locales (default all configured)")
    .option("--dry-run", "preview changes without calling a provider or writing files")
    .option(
      "--prune",
      "remove orphaned keys (in a target file but absent from source) from the written file",
    )
    .option(
      "--lock-timeout <seconds>",
      "how long to wait for a held per-locale write lock before failing (default 600)",
    )
    .option(
      "--concurrency <n>",
      "how many target locales to translate at once (default 1; not allowed with a maxTokens budget)",
    )
    .option(
      "--no-cache",
      "bypass the local translation-memory cache (verbatra.cache.json) for this run",
    )
    .option("--json", "print the run summary as JSON")
    .action(async (opts: unknown) => {
      ctx.setCode(await runTranslate(opts, ctx.deps, ctx.streams));
    })
    .addHelpText(
      "after",
      [
        "",
        "Examples:",
        "  $ verbatra translate                 translate once using the config it finds",
        "  $ verbatra translate --dry-run       preview changes without calling a provider",
        "  $ verbatra translate --locales de    translate only German, one locale at a time",
        "  $ verbatra translate --prune         also remove orphaned keys from target files",
        "  $ verbatra translate --prune --dry-run  preview the keys that would be pruned",
        "  $ verbatra translate --json          machine-readable summary on stdout",
      ].join("\n"),
    );
}

function registerWatchCommand(program: Command, ctx: ProgramContext): void {
  program
    .command("watch")
    .description("Re-translate on every source change until interrupted")
    .option("--cwd <path>", "resolve config and locale files from this directory")
    .option("--config <path>", "load this config file instead of searching for one")
    .option("--locales <list>", "comma-separated subset of target locales (default all configured)")
    .option(
      "--debounce <ms>",
      "wait this many milliseconds after a change before translating (default 300)",
    )
    .option(
      "--lock-timeout <seconds>",
      "how long to wait for a held per-locale write lock before failing (default 600)",
    )
    .option(
      "--concurrency <n>",
      "how many target locales to translate at once per run (default 1; not allowed with a maxTokens budget)",
    )
    .option(
      "--no-cache",
      "bypass the local translation-memory cache (verbatra.cache.json) on every run",
    )
    .option("--json", "print each run as one NDJSON record")
    .action(async (opts: unknown) => {
      ctx.setCode(await runWatchCommand(opts, ctx.deps, ctx.streams, ctx.hooks));
    });
}

function registerExportCommand(program: Command, ctx: ProgramContext): void {
  program
    .command("export")
    .description(
      "Export untranslated strings into a translator handoff (Excel workbook, CSV, or TSV)",
    )
    .option("--cwd <path>", "resolve config and locale files from this directory")
    .option("--config <path>", "load this config file instead of searching for one")
    .option(
      "--out <path>",
      "write the handoff here: a file for xlsx (default verbatra-translations.xlsx), a directory for csv and tsv (default verbatra-translations)",
    )
    .option("--locales <list>", "comma-separated subset of target locales (default all configured)")
    .option("--include-unchanged", "also export already up-to-date strings (off by default)")
    .option("--format <format>", FORMAT_OPTION_DESCRIPTION)
    .option("--json", "print the export result as JSON")
    .action(async (opts: unknown) => {
      ctx.setCode(await runExport(opts, ctx.deps, ctx.streams));
    })
    .addHelpText(
      "after",
      [
        "",
        "Examples:",
        "  $ verbatra export                       write the workbook with missing and changed strings",
        "  $ verbatra export --locales de,fr       only the German and French sheets",
        "  $ verbatra export --include-unchanged   include already up-to-date strings",
        "  $ verbatra export --format csv          write one <locale>.csv per locale into a directory",
      ].join("\n"),
    );
}

function registerImportCommand(program: Command, ctx: ProgramContext): void {
  program
    .command("import")
    .argument(
      "<workbook>",
      "path to the filled handoff: a workbook file, one csv or tsv file, or a directory of them",
    )
    .description(
      "Import a filled handoff back into the locale files, running the same safety checks",
    )
    .option("--cwd <path>", "resolve config and locale files from this directory")
    .option("--config <path>", "load this config file instead of searching for one")
    .option("--dry-run", "validate and report without writing locale files or updating the lock")
    .option("--format <format>", FORMAT_OPTION_DESCRIPTION)
    .option("--json", "print the run summary as JSON")
    .action(async (workbook: string, opts: unknown) => {
      ctx.setCode(await runImport(workbook, opts, ctx.deps, ctx.streams));
    })
    .addHelpText(
      "after",
      [
        "",
        "Examples:",
        "  $ verbatra import translations.xlsx             import the filled workbook",
        "  $ verbatra import translations.xlsx --dry-run   validate and report, write nothing",
        "  $ verbatra import handoff --format csv          import every <locale>.csv in the directory",
      ].join("\n"),
    );
}

function registerCheckCommand(program: Command, ctx: ProgramContext): void {
  program
    .command("check")
    .description("Report which keys are missing or stale per locale without writing files")
    .option("--cwd <path>", "resolve config and locale files from this directory")
    .option("--config <path>", "load this config file instead of searching for one")
    .option("--locales <list>", "comma-separated subset of target locales (default all configured)")
    .option("--json", "print the check summary as JSON")
    .action(async (opts: unknown) => {
      ctx.setCode(await runCheck(opts, ctx.deps, ctx.streams));
    })
    .addHelpText(
      "after",
      [
        "",
        "Examples:",
        "  $ verbatra check                  report missing and stale keys per locale (exit 1 if drifted)",
        "  $ verbatra check --locales de,fr  only check the German and French locales",
        "  $ verbatra check --json           machine-readable status on stdout for CI",
      ].join("\n"),
    );
}

function registerDiffCommand(program: Command, ctx: ProgramContext): void {
  program
    .command("diff")
    .description(
      "Show the keys that would be added, re-translated, or orphaned per locale without writing files",
    )
    .option("--cwd <path>", "resolve config and locale files from this directory")
    .option("--config <path>", "load this config file instead of searching for one")
    .option("--locales <list>", "comma-separated subset of target locales (default all configured)")
    .option("--json", "print the diff summary as JSON")
    .action(async (opts: unknown) => {
      ctx.setCode(await runDiff(opts, ctx.deps, ctx.streams));
    })
    .addHelpText(
      "after",
      [
        "",
        "Examples:",
        "  $ verbatra diff                  list the pending keys per locale (exit 1 if any are pending)",
        "  $ verbatra diff --locales de,fr  only diff the German and French locales",
        "  $ verbatra diff --json           machine-readable key lists on stdout for CI",
      ].join("\n"),
    );
}

function registerDoctorCommand(program: Command, ctx: ProgramContext): void {
  program
    .command("doctor")
    .description("Validate the project setup without calling a provider or reading an API key")
    .option("--cwd <path>", "resolve config and locale files from this directory")
    .option("--config <path>", "load this config file instead of searching for one")
    .option("--json", "print the doctor report as JSON")
    .action(async (opts: unknown) => {
      ctx.setCode(await runDoctor(opts, ctx.deps, ctx.streams));
    })
    .addHelpText(
      "after",
      [
        "",
        "Examples:",
        "  $ verbatra doctor         report every setup problem at once (exit 1 if any)",
        "  $ verbatra doctor --json  machine-readable report on stdout for CI",
      ].join("\n"),
    );
}

function registerStudioCommand(program: Command, ctx: ProgramContext): void {
  program
    .command("studio")
    .description("Start Verbatra Studio, the local translation dashboard")
    .option("--cwd <path>", "resolve config and locale files from this directory")
    .option("--config <path>", "load this config file instead of searching for one")
    .option("--port <n>", "override the default Studio port (must be 1-65535)")
    .option(
      "--allow-spend",
      "allow Studio to call a translation provider (also: VERBATRA_STUDIO_ALLOW_SPEND)",
    )
    .option(
      "--expose-agent-tools",
      "register Studio's RPC methods as WebMCP agent tools in the browser (also: VERBATRA_STUDIO_AGENT_TOOLS)",
    )
    .action(async (opts: unknown) => {
      ctx.setCode(await runStudioCommand(opts, ctx.deps, ctx.streams, ctx.hooks));
    })
    .addHelpText(
      "after",
      [
        "",
        "Examples:",
        "  $ verbatra studio                      start Verbatra Studio on the default port",
        "  $ verbatra studio --port 6000          start Verbatra Studio on a specific port",
        "  $ verbatra studio --allow-spend        start Studio with retranslate enabled",
        "  $ verbatra studio --expose-agent-tools start Studio with the WebMCP agent tools enabled",
      ].join("\n"),
    );
}

function registerMcpCommand(program: Command, ctx: ProgramContext): void {
  program
    .command("mcp")
    .description("Start a stdio MCP server exposing verbatra's tools to an MCP client")
    .option("--cwd <path>", "resolve config and locale files from this directory")
    .option("--config <path>", "load this config file instead of searching for one")
    .option(
      "--allow-spend",
      "advertise the tools that call a translation provider (also: VERBATRA_MCP_ALLOW_SPEND)",
    )
    .action(async (opts: unknown) => {
      ctx.setCode(await runMcpCommand(opts, ctx.deps, ctx.streams, ctx.hooks));
    })
    .addHelpText(
      "after",
      [
        "",
        "Examples:",
        "  $ verbatra mcp                 start the MCP server with only local, non-spending tools",
        "  $ verbatra mcp --allow-spend    also advertise the provider-calling tools",
        "",
        "Nothing but MCP protocol messages is ever written to stdout; every log line goes to " +
          "stderr.",
      ].join("\n"),
    );
}

function registerInitCommand(program: Command, ctx: ProgramContext): void {
  program
    .command("init")
    .description("Create a verbatra config and .env example for this project")
    .option("--cwd <path>", "write the config and env files to this directory")
    .option(
      "--provider <id>",
      "translation provider to use: anthropic, openai, gemini, deepl, or google-translate " +
        "(required unless prompted)",
    )
    .option("--source <locale>", "locale your source strings are written in (default en)")
    .option("--targets <locales>", "comma-separated locales to translate into (default de)")
    .option(
      "--path <pattern>",
      "locale file pattern containing the {locale} token (default locales/{locale}.json)",
    )
    .option("--yes", "skip prompts and accept the defaults")
    .option("--force", "overwrite an existing config or .env.example")
    .action(async (opts: InitOpts) => {
      ctx.setCode(await runInit(opts, ctx.streams));
    })
    .addHelpText(
      "after",
      [
        "",
        "Examples:",
        "  $ verbatra init --provider anthropic        create config + .env example, prompting for the rest",
        "  $ verbatra init --provider deepl --yes      non-interactive, accept all defaults",
        "  $ verbatra init --provider google-translate --yes  non-interactive, accept all defaults",
      ].join("\n"),
    );
}

function buildProgram(
  deps: CliDeps,
  streams: Streams,
  hooks: RunHooks,
  setCode: (code: number) => void,
): Command {
  const program = new Command();
  program
    .name("verbatra")
    .description(
      "Automate i18n translation and keep your locale files in sync, using a hosted or local AI or machine-translation provider",
    )
    .version(CLI_VERSION)
    .exitOverride()
    .configureOutput({ writeOut: (s) => streams.out(s), writeErr: (s) => streams.err(s) });

  const ctx: ProgramContext = { deps, streams, hooks, setCode };
  registerTranslateCommand(program, ctx);
  registerWatchCommand(program, ctx);
  registerExportCommand(program, ctx);
  registerImportCommand(program, ctx);
  registerCheckCommand(program, ctx);
  registerDiffCommand(program, ctx);
  registerDoctorCommand(program, ctx);
  registerStudioCommand(program, ctx);
  registerMcpCommand(program, ctx);
  registerInitCommand(program, ctx);

  return program;
}

export async function run(
  argv: readonly string[],
  deps: CliDeps,
  streams: Streams,
  hooks: RunHooks = {},
): Promise<number> {
  let code = 0;
  const program = buildProgram(deps, streams, hooks, (c) => {
    code = c;
  });
  try {
    await program.parseAsync([...argv], { from: "user" });
  } catch (error) {
    if (error instanceof CommanderError) {
      return error.exitCode === 0 ? 0 : renderUsageFailureExit2(error, program, argv, streams);
    }
    throw error;
  }
  return code;
}
