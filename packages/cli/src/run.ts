import {
  type CheckInput,
  type CheckSummary,
  DEFAULT_EXCHANGE_FORMAT,
  DEFAULT_TMX_PATH,
  DEFAULT_TYPES_PATH,
  type DiffSummary,
  EXCHANGE_FORMATS,
  type ExchangeFormat,
  type ExportWorkbookInput,
  type ExportWorkbookResult,
  type GenerateTypesInput,
  isMachineTranslationEnabled,
  type LoadedConfig,
  type LockWaitEvent,
  type ProgressEvent,
  QA_SEVERITIES,
  type QaSeverity,
  type RunSummary,
  resolveDryRun,
  type TranslateInput,
  type VerbatraConfig,
} from "@verbatra/sdk";
import { Command, CommanderError } from "commander";
import { z } from "zod";
import type { CliErrorCode } from "./cli-error-codes.js";
import { CliUsageError } from "./cli-usage-error.js";
import { hasConfigFile } from "./config-presence.js";
import { loadEnvFiles } from "./env.js";
import { appendMissingGitignoreEntries } from "./gitignore.js";
import { runInit } from "./init.js";
import { renderErrorEnvelope, renderSuccessEnvelope } from "./json-envelope.js";
import { runMcp } from "./mcp-command.js";
import { readPackageManifest } from "./package-manifest.js";
import { parsePositiveIntegerOption } from "./positive-integer-option.js";
import { createProgressPresenter, scanProgressReporter } from "./progress-presenter.js";
import { redactingStreams } from "./redacting-streams.js";
import {
  displayPath,
  renderCheckHuman,
  renderDiffHuman,
  renderDoctorHuman,
  renderExportHuman,
  renderExtractHuman,
  renderHuman,
  renderLockWait,
  renderPseudoHuman,
  renderTmxExportHuman,
  renderTmxImportHuman,
  renderTypesHuman,
  toRenderableError,
} from "./render.js";
import { runStudio } from "./studio-command.js";
import {
  DEFAULT_TERMINAL_SETTINGS,
  resolveTerminalMode,
  type TerminalFacts,
  type TerminalSettings,
} from "./terminal-mode.js";
import type { CliDeps, InitOpts, RunHooks, Streams } from "./types.js";
import { createUi, formatElapsed, type Task, type Ui } from "./ui.js";
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
  estimate: z.boolean().optional(),
  includeHuman: z.boolean().optional(),
  maxTokens: z.string().optional(),
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
  lockTimeout: z.string().optional(),
});

const TMX_DIRECTIONS = ["import", "export"] as const;

const tmxOptsSchema = sharedCommandOptsSchema.extend({
  locales: localeListSchema,
  dryRun: z.boolean().optional(),
  overwrite: z.boolean().optional(),
});

type TmxDirection = (typeof TMX_DIRECTIONS)[number];

const IMPORT_ONLY_TMX_FLAGS = ["dry-run", "overwrite"] as const;

function assertExportFlags(opts: z.infer<typeof tmxOptsSchema>): void {
  const given = IMPORT_ONLY_TMX_FLAGS.filter((flag) =>
    flag === "dry-run" ? opts.dryRun === true : opts.overwrite === true,
  );
  if (given.length > 0) {
    throw new CliUsageError(
      "INVALID_DIRECTION",
      `${given.map((flag) => `--${flag}`).join(" and ")} ${given.length === 1 ? "applies" : "apply"} to "tmx import" only. An export reads the translation memory and writes a file; it never changes the memory.`,
    );
  }
}

function parseTmxDirection(raw: string): TmxDirection {
  const direction = TMX_DIRECTIONS.find((known) => known === raw);
  if (direction === undefined) {
    throw new CliUsageError(
      "INVALID_DIRECTION",
      `The tmx command takes "import" or "export" as its direction, got "${raw}".`,
    );
  }
  return direction;
}

const checkOptsSchema = sharedCommandOptsSchema.extend({
  locales: localeListSchema,
  consistency: z.boolean().optional(),
  qa: z.boolean().optional(),
  severity: z.string().optional(),
  strict: z.boolean().optional(),
});

type CheckOpts = z.infer<typeof checkOptsSchema>;

function parseQaSeverity(opts: CheckOpts): QaSeverity | undefined {
  if (opts.qa !== true && (opts.severity !== undefined || opts.strict === true)) {
    const given = opts.severity !== undefined ? "--severity" : "--strict";
    throw new CliUsageError(
      "INVALID_QA_OPTION",
      `${given} applies to the quality check only. Add --qa to run it.`,
    );
  }
  if (opts.severity === undefined) {
    return undefined;
  }
  const severity = QA_SEVERITIES.find((known) => known === opts.severity);
  if (severity === undefined) {
    throw new CliUsageError(
      "INVALID_SEVERITY",
      `The --severity option takes ${QA_SEVERITIES.map((known) => `"${known}"`).join(" or ")}, got "${opts.severity}".`,
    );
  }
  if (severity === "error" && opts.strict === true) {
    throw new CliUsageError(
      "INVALID_QA_OPTION",
      "--strict fails the run on warnings, and --severity error reports none. Drop one of the two.",
    );
  }
  return severity;
}

function parseCheckOpts(rawOpts: unknown): CheckOpts & { readonly qaSeverity?: QaSeverity } {
  const opts = parseLocaleCommandOpts(checkOptsSchema, rawOpts);
  const qaSeverity = parseQaSeverity(opts);
  return qaSeverity !== undefined ? { ...opts, qaSeverity } : opts;
}

function checkExitCode(summary: CheckSummary, strict: boolean): number {
  const qa = summary.qa;
  const qaFails = qa !== undefined && (qa.errors > 0 || (strict && qa.warnings > 0));
  return summary.inSync && !qaFails ? 0 : 1;
}

const diffOptsSchema = sharedCommandOptsSchema.extend({
  locales: localeListSchema,
  unused: z.boolean().optional(),
});

const typesOptsSchema = sharedCommandOptsSchema.extend({
  out: z.string().optional(),
  check: z.boolean().optional(),
});

function parseTypesCommandOpts(rawOpts: unknown): z.infer<typeof typesOptsSchema> {
  const opts = typesOptsSchema.parse(rawOpts);
  if (opts.out !== undefined && opts.out.trim() === "") {
    throw new CliUsageError(
      "INVALID_OUT",
      `The --out option was provided but names no file. Pass a path relative to the working directory, or omit it to use ${DEFAULT_TYPES_PATH}.`,
    );
  }
  return opts;
}

const PSEUDO_LOCALE_TAG = /^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/;

const pseudoOptsSchema = sharedCommandOptsSchema.extend({
  locale: z.string().optional(),
  out: z.string().optional(),
});

function parsePseudoCommandOpts(rawOpts: unknown): z.infer<typeof pseudoOptsSchema> {
  const opts = pseudoOptsSchema.parse(rawOpts);
  if (opts.locale !== undefined && !PSEUDO_LOCALE_TAG.test(opts.locale)) {
    throw new CliUsageError(
      "INVALID_LOCALE",
      `The --locale option must be a language tag such as en-XA, made of letters, digits, and hyphens, got "${opts.locale}".`,
    );
  }
  if (opts.out !== undefined && opts.out.trim() === "") {
    throw new CliUsageError(
      "INVALID_OUT",
      "The --out option was provided but names no directory. Pass a path relative to the working directory, or omit it to use .verbatra-local/pseudo.",
    );
  }
  return opts;
}

function runExitCode(summary: {
  readonly partial: readonly string[];
  readonly failed: readonly string[];
}): number {
  return summary.failed.length > 0 || summary.partial.length > 0 ? 1 : 0;
}

const NEEDS_HUMAN_EXIT_CODE = 3;

function protectedKeyCount(summary: RunSummary): number {
  return summary.locales.reduce((total, locale) => total + locale.protected.length, 0);
}

function needsHumanKeyCount(config: TranslateInput["config"], summary: RunSummary): number {
  const unfilled = summary.locales.reduce((total, locale) => total + locale.unfilled.length, 0);
  return isMachineTranslationEnabled(config) ? unfilled : unfilled + protectedKeyCount(summary);
}

function translateExitCode(config: TranslateInput["config"], summary: RunSummary): number {
  const code = runExitCode(summary);
  return code === 0 && needsHumanKeyCount(config, summary) > 0 ? NEEDS_HUMAN_EXIT_CODE : code;
}

function keysPhrase(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function renderNeedsHumanHint(
  config: TranslateInput["config"],
  summary: RunSummary,
  includeHuman: boolean,
  ui: Ui,
): void {
  if (isMachineTranslationEnabled(config)) {
    if (!includeHuman) {
      renderProtectedHint(summary, ui);
    }
    return;
  }
  const count = needsHumanKeyCount(config, summary);
  if (count === 0) {
    return;
  }
  ui.warn(
    `machine translation is disabled by policy; ${keysPhrase(count, "key needs", "keys need")} a human translation (hand them off with verbatra export)`,
  );
}

function reviewableProtectedKeyCount(summary: RunSummary): number {
  return summary.locales.reduce(
    (total, locale) => total + locale.protected.filter((entry) => entry.reason !== "pinned").length,
    0,
  );
}

function renderProtectedHint(summary: RunSummary, ui: Ui): void {
  const count = reviewableProtectedKeyCount(summary);
  if (count === 0) {
    return;
  }
  ui.warn(
    `${keysPhrase(count, "protected key was", "protected keys were")} left for a person to review (hand them off with verbatra export, or retranslate with --include-human)`,
  );
}

interface CommandContext {
  readonly streams: Streams;
  readonly ui: Ui;
  readonly command: string | null;
  readonly json: boolean;
}

const jsonFlagSchema = z.object({ json: z.boolean().optional() });

function commandContext(
  command: string,
  rawOpts: unknown,
  streams: Streams,
  settings: TerminalSettings = DEFAULT_TERMINAL_SETTINGS,
): CommandContext {
  const parsed = jsonFlagSchema.safeParse(rawOpts);
  const json = parsed.success && parsed.data.json === true;
  const ui = createUi(
    streams,
    resolveTerminalMode(settings.facts, { json, quiet: settings.quiet, color: settings.color }),
  );
  return { streams: ui.streams, ui, command, json };
}

function topUpGitignore(cwd: string, context: CommandContext, dryRun?: boolean): void {
  const added = appendMissingGitignoreEntries(cwd, dryRun);
  if (added.length > 0 && !context.json) {
    context.ui.info(`updated .gitignore (added ${added.join(", ")})`);
  }
}

function renderFailureExit2(error: unknown, context: CommandContext): number {
  const renderable = toRenderableError(error);
  context.ui.error(renderable);
  if (context.json) {
    context.streams.out(`${renderErrorEnvelope(context.command, renderable)}\n`);
  }
  return 2;
}

const USAGE_ERROR_CODE: CliErrorCode = "USAGE_ERROR";

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

const SHELL_SAFE_WORD = /^[\w@%+=:,./-]+$/;

function shellQuote(value: string): string {
  return SHELL_SAFE_WORD.test(value) ? value : `'${value.replaceAll("'", "'\\''")}'`;
}

interface LocationOpts {
  readonly cwd?: string | undefined;
  readonly config?: string | undefined;
}

function verbatraCommand(args: readonly string[], opts: LocationOpts): string {
  const words = ["verbatra", ...args];
  if (opts.cwd !== undefined) {
    words.push("--cwd", opts.cwd);
  }
  if (opts.config !== undefined) {
    words.push("--config", opts.config);
  }
  return words.map(shellQuote).join(" ");
}

function loadOptions(opts: SharedOpts, cwd: string): { cwd: string; configPath?: string } {
  return {
    cwd,
    ...(opts.config !== undefined ? { configPath: opts.config } : {}),
  };
}

async function withLoadedRunErrors<Loaded>(
  context: CommandContext,
  load: () => Promise<Loaded>,
  body: (loaded: Loaded) => Promise<number>,
  beforeLoad?: () => void,
): Promise<number> {
  try {
    beforeLoad?.();
    const loaded = await load();
    return await body(loaded);
  } catch (error) {
    return renderFailureExit2(error, context);
  }
}

async function withWholeRunErrors(
  deps: CliDeps,
  context: CommandContext,
  loadOpts: { cwd: string; configPath?: string },
  body: (config: Awaited<ReturnType<CliDeps["loadConfig"]>>) => Promise<number>,
  beforeLoad?: () => void,
): Promise<number> {
  return withLoadedRunErrors(context, () => deps.loadConfig(loadOpts), body, beforeLoad);
}

const MAX_DEBOUNCE_MS = 60_000;

function parseDebounce(value: string | undefined): number | undefined {
  return parsePositiveIntegerOption(value, {
    code: "INVALID_DEBOUNCE",
    describe: `--debounce option must be a positive whole number of milliseconds no greater than ${MAX_DEBOUNCE_MS}`,
    min: 1,
    max: MAX_DEBOUNCE_MS,
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

const MAX_LOCK_TIMEOUT_SECONDS = 3600;

function parseLockTimeout(value: string | undefined): number | undefined {
  const seconds = parsePositiveIntegerOption(value, {
    code: "INVALID_LOCK_TIMEOUT",
    describe: `--lock-timeout option must be a positive whole number of seconds no greater than ${MAX_LOCK_TIMEOUT_SECONDS}`,
    min: 1,
    max: MAX_LOCK_TIMEOUT_SECONDS,
  });
  return seconds === undefined ? undefined : seconds * 1000;
}

const MAX_CONCURRENCY = 100;

function parseConcurrency(value: string | undefined): number | undefined {
  return parsePositiveIntegerOption(value, {
    code: "INVALID_CONCURRENCY",
    describe: `--concurrency option must be a positive whole number no greater than ${MAX_CONCURRENCY}`,
    min: 1,
    max: MAX_CONCURRENCY,
  });
}

function parseMaxTokens(value: string | undefined): number | undefined {
  return parsePositiveIntegerOption(value, {
    code: "INVALID_MAX_TOKENS",
    describe: `--max-tokens option must be a positive whole number no greater than ${Number.MAX_SAFE_INTEGER}`,
    min: 1,
    max: Number.MAX_SAFE_INTEGER,
  });
}

interface ParsedTranslateOpts extends z.infer<typeof translateOptsSchema> {
  readonly lockAcquireTimeoutMs?: number;
  readonly concurrencyValue?: number;
  readonly maxTokensValue?: number;
}

function parseTranslateCommandOpts(rawOpts: unknown): ParsedTranslateOpts {
  const opts = parseLocaleCommandOpts(translateOptsSchema, rawOpts);
  const lockAcquireTimeoutMs = parseLockTimeout(opts.lockTimeout);
  const concurrencyValue = parseConcurrency(opts.concurrency);
  const maxTokensValue = parseMaxTokens(opts.maxTokens);
  return {
    ...opts,
    ...(lockAcquireTimeoutMs !== undefined ? { lockAcquireTimeoutMs } : {}),
    ...(concurrencyValue !== undefined ? { concurrencyValue } : {}),
    ...(maxTokensValue !== undefined ? { maxTokensValue } : {}),
  };
}

function lockWaitReporter(context: CommandContext): (event: LockWaitEvent) => void {
  return (event) => {
    context.streams.err(`${renderLockWait(event, context.json)}\n`);
  };
}

function progressReporter(context: CommandContext): (event: ProgressEvent) => void {
  return createProgressPresenter(context.ui, { json: context.json, base: process.cwd() });
}

async function withTask<T>(
  context: CommandContext,
  label: string,
  work: (task: Task) => Promise<T>,
): Promise<T> {
  const task = context.ui.task(label);
  try {
    const result = await work(task);
    task.succeed();
    return result;
  } catch (error) {
    task.fail();
    throw error;
  }
}

function localesPhrase(count: number): string {
  return `${count} ${count === 1 ? "locale" : "locales"}`;
}

function providerLabel(provider: VerbatraConfig["provider"]): string {
  const options: Readonly<Record<string, unknown>> = provider.options;
  const model = options.model;
  return typeof model === "string" ? `${provider.id}/${model}` : provider.id;
}

function translateStartLine(opts: ParsedTranslateOpts, config: VerbatraConfig): string {
  const locales = localesPhrase(opts.locales?.length ?? config.targetLocales.length);
  if (opts.estimate === true) {
    return `estimating ${locales}, no provider call`;
  }
  if (opts.dryRun === true) {
    return `dry run over ${locales}, no provider call`;
  }
  if (!isMachineTranslationEnabled(config)) {
    return `filling ${locales} from the translation memory (provider none)`;
  }
  return `translating ${locales} with ${providerLabel(config.provider)}`;
}

function usagePhrase(summary: RunSummary): string {
  const usage = summary.usage;
  return usage === undefined ? "" : `, ${usage.inputTokens + usage.outputTokens} tokens`;
}

function reportTranslateOutcome(
  context: CommandContext,
  opts: LocationOpts,
  summary: RunSummary,
  exitCode: number,
  startedAt: number,
): void {
  const elapsed = formatElapsed(Date.now() - startedAt);
  if (summary.dryRun) {
    context.ui.status("ok", `dry run done in ${elapsed}, nothing written`);
    context.ui.hint(verbatraCommand(["translate"], opts), "run it for real");
    return;
  }
  if (exitCode === 0) {
    context.ui.status("ok", `done in ${elapsed}${usagePhrase(summary)}`);
    context.ui.hint(verbatraCommand(["check"], opts), "confirm every locale is in sync");
    return;
  }
  context.ui.status("warn", `finished in ${elapsed}${usagePhrase(summary)}, see the summary above`);
}

function buildTranslateInput(
  opts: ParsedTranslateOpts,
  config: TranslateInput["config"],
  cwd: string,
  context: CommandContext,
): TranslateInput {
  return {
    config,
    cwd,
    onLockWait: lockWaitReporter(context),
    onProgress: progressReporter(context),
    ...(opts.locales !== undefined ? { locales: opts.locales } : {}),
    ...(opts.dryRun === true ? { dryRun: true } : {}),
    ...(opts.prune === true ? { prune: true } : {}),
    ...(opts.lockAcquireTimeoutMs !== undefined
      ? { lockAcquireTimeoutMs: opts.lockAcquireTimeoutMs }
      : {}),
    ...(opts.concurrencyValue !== undefined ? { concurrency: opts.concurrencyValue } : {}),
    ...(opts.cache === false ? { cache: false } : {}),
    ...(opts.estimate === true ? { estimate: true } : {}),
    ...(opts.includeHuman === true ? { humanEdits: "overwrite" as const } : {}),
    ...(opts.maxTokensValue !== undefined ? { maxTokens: opts.maxTokensValue } : {}),
  };
}

export async function runTranslate(
  rawOpts: unknown,
  deps: CliDeps,
  streams: Streams,
  settings?: TerminalSettings,
): Promise<number> {
  const context = commandContext("translate", rawOpts, streams, settings);
  return withParsedOpts(
    () => parseTranslateCommandOpts(rawOpts),
    context,
    async (opts) => {
      const cwd = opts.cwd ?? process.cwd();
      topUpGitignore(cwd, context, resolveDryRun(opts));
      return withWholeRunErrors(
        deps,
        context,
        loadOptions(opts.config !== undefined ? { config: opts.config } : {}, cwd),
        async (config) => {
          const startedAt = Date.now();
          context.ui.info(translateStartLine(opts, config));
          const summary = await deps.translate(buildTranslateInput(opts, config, cwd, context));
          context.streams.out(
            context.json
              ? `${renderSuccessEnvelope("translate", summary)}\n`
              : `${renderHuman(summary)}\n`,
          );
          renderNeedsHumanHint(config, summary, opts.includeHuman === true, context.ui);
          const exitCode = translateExitCode(config, summary);
          reportTranslateOutcome(context, opts, summary, exitCode, startedAt);
          return exitCode;
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
  settings?: TerminalSettings,
): Promise<number> {
  const context = commandContext("watch", rawOpts, streams, settings);
  return withParsedOpts(
    () => parseWatchCommandOpts(rawOpts),
    context,
    async (opts) => {
      const cwd = opts.cwd ?? process.cwd();
      topUpGitignore(cwd, context);
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
        context.ui,
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
  settings: TerminalSettings,
): Promise<number> {
  const session = await runStudio(rawOpts, deps, streams, settings);
  hooks.onStudioSession?.(session);
  return session.done;
}

async function runMcpCommand(
  rawOpts: unknown,
  deps: CliDeps,
  streams: Streams,
  hooks: RunHooks,
  settings: TerminalSettings,
): Promise<number> {
  const session = await runMcp(rawOpts, deps, streams, settings);
  hooks.onMcpSession?.(session);
  return session.done;
}

function exportInput(
  loaded: LoadedConfig,
  cwd: string,
  opts: z.infer<typeof exportOptsSchema> & { readonly format: ExchangeFormat | undefined },
): ExportWorkbookInput {
  return {
    config: loaded.config,
    cwd,
    ...configFilePaths(loaded),
    ...(opts.out !== undefined ? { out: opts.out } : {}),
    ...(opts.locales !== undefined ? { locales: opts.locales } : {}),
    ...(opts.includeUnchanged === true ? { includeUnchanged: true } : {}),
    ...(opts.format !== undefined ? { format: opts.format } : {}),
  };
}

function hintImportOfExport(
  context: CommandContext,
  opts: LocationOpts,
  cwd: string,
  result: ExportWorkbookResult,
): void {
  if (result.locales.some((locale) => locale.rows > 0)) {
    context.ui.hint(
      verbatraCommand(["import", displayPath(result.path, cwd)], opts),
      "once your translators have filled it in",
    );
  }
}

async function runExport(
  rawOpts: unknown,
  deps: CliDeps,
  streams: Streams,
  settings?: TerminalSettings,
): Promise<number> {
  const context = commandContext("export", rawOpts, streams, settings);
  return withParsedOpts(
    () => {
      const opts = parseLocaleCommandOpts(exportOptsSchema, rawOpts);
      return { ...opts, format: parseExchangeFormat(opts.format) };
    },
    context,
    async (opts) => {
      const cwd = opts.cwd ?? process.cwd();
      return withLoadedRunErrors(
        context,
        () =>
          deps.loadConfigWithMeta(
            loadOptions(opts.config !== undefined ? { config: opts.config } : {}, cwd),
          ),
        async (loaded) => {
          const result = await withTask(
            context,
            `exporting to ${opts.format ?? DEFAULT_EXCHANGE_FORMAT}`,
            () => deps.exportWorkbook(exportInput(loaded, cwd, opts)),
          );
          context.streams.out(
            context.json
              ? `${renderSuccessEnvelope("export", result)}\n`
              : `${renderExportHuman(result, process.cwd())}\n`,
          );
          hintImportOfExport(context, opts, cwd, result);
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
  settings?: TerminalSettings,
): Promise<number> {
  const context = commandContext("import", rawOpts, streams, settings);
  return withParsedOpts(
    () => {
      const opts = importOptsSchema.parse(rawOpts);
      return {
        ...opts,
        format: parseExchangeFormat(opts.format),
        lockAcquireTimeoutMs: parseLockTimeout(opts.lockTimeout),
      };
    },
    context,
    async (opts) => {
      const cwd = opts.cwd ?? process.cwd();
      topUpGitignore(cwd, context, opts.dryRun);
      return withWholeRunErrors(
        deps,
        context,
        loadOptions(opts.config !== undefined ? { config: opts.config } : {}, cwd),
        async (config) => {
          const summary = await withTask(context, `importing ${workbook}`, () =>
            deps.importWorkbook({
              config,
              workbook,
              cwd,
              onLockWait: lockWaitReporter(context),
              ...(opts.dryRun === true ? { dryRun: true } : {}),
              ...(opts.format !== undefined ? { format: opts.format } : {}),
              ...(opts.lockAcquireTimeoutMs !== undefined
                ? { lockAcquireTimeoutMs: opts.lockAcquireTimeoutMs }
                : {}),
            }),
          );
          context.streams.out(
            context.json
              ? `${renderSuccessEnvelope("import", summary)}\n`
              : `${renderHuman(summary, "import")}\n`,
          );
          const exitCode = runExitCode(summary);
          if (summary.dryRun) {
            context.ui.hint(
              verbatraCommand(["import", workbook], opts),
              "without --dry-run to write the files",
            );
          } else if (exitCode === 0) {
            context.ui.hint(verbatraCommand(["check"], opts), "confirm every locale is in sync");
          }
          return exitCode;
        },
      );
    },
  );
}

async function runTmxImport(
  file: string | undefined,
  opts: z.infer<typeof tmxOptsSchema>,
  cwd: string,
  deps: CliDeps,
  context: CommandContext,
): Promise<number> {
  return withWholeRunErrors(
    deps,
    context,
    loadOptions(opts.config !== undefined ? { config: opts.config } : {}, cwd),
    async (config) => {
      const source = file ?? DEFAULT_TMX_PATH;
      const result = await withTask(context, `importing ${source} into the memory`, () =>
        deps.importTmx({
          config,
          cwd,
          file: source,
          ...(opts.dryRun === true ? { dryRun: true } : {}),
          ...(opts.overwrite === true ? { overwrite: true } : {}),
          ...(opts.locales !== undefined ? { locales: opts.locales } : {}),
        }),
      );
      context.streams.out(
        context.json
          ? `${renderSuccessEnvelope("tmx", result)}\n`
          : `${renderTmxImportHuman(result, process.cwd())}\n`,
      );
      if (result.dryRun) {
        context.ui.hint(
          verbatraCommand(["tmx", "import", source], opts),
          "without --dry-run to store it",
        );
      } else {
        context.ui.hint(
          verbatraCommand(["translate"], opts),
          "reuses the imported memory before calling a provider",
        );
      }
      return 0;
    },
  );
}

async function runTmxExport(
  file: string | undefined,
  opts: z.infer<typeof tmxOptsSchema>,
  cwd: string,
  deps: CliDeps,
  context: CommandContext,
): Promise<number> {
  return withLoadedRunErrors(
    context,
    () =>
      deps.loadConfigWithMeta(
        loadOptions(opts.config !== undefined ? { config: opts.config } : {}, cwd),
      ),
    async (loaded) => {
      const result = await withTask(context, "exporting the memory as TMX", () =>
        deps.exportTmx({
          config: loaded.config,
          cwd,
          ...configFilePaths(loaded),
          toolVersion: CLI_VERSION,
          ...(file !== undefined ? { out: file } : {}),
          ...(opts.locales !== undefined ? { locales: opts.locales } : {}),
        }),
      );
      context.streams.out(
        context.json
          ? `${renderSuccessEnvelope("tmx", result)}\n`
          : `${renderTmxExportHuman(result, process.cwd())}\n`,
      );
      return 0;
    },
  );
}

export async function runTmx(
  rawDirection: string,
  file: string | undefined,
  rawOpts: unknown,
  deps: CliDeps,
  streams: Streams,
  settings?: TerminalSettings,
): Promise<number> {
  const context = commandContext("tmx", rawOpts, streams, settings);
  return withParsedOpts(
    () => {
      const direction = parseTmxDirection(rawDirection);
      const opts = parseLocaleCommandOpts(tmxOptsSchema, rawOpts);
      if (direction === "export") {
        assertExportFlags(opts);
      }
      return { direction, opts };
    },
    context,
    async ({ direction, opts }) => {
      const cwd = opts.cwd ?? process.cwd();
      if (direction === "export") {
        return runTmxExport(file, opts, cwd, deps, context);
      }
      topUpGitignore(cwd, context, opts.dryRun);
      return runTmxImport(file, opts, cwd, deps, context);
    },
  );
}

function checkInput(
  config: VerbatraConfig,
  cwd: string,
  opts: CheckOpts & { readonly qaSeverity?: QaSeverity },
): CheckInput {
  return {
    config,
    cwd,
    ...(opts.locales !== undefined ? { locales: opts.locales } : {}),
    ...(opts.consistency === true ? { consistency: true } : {}),
    ...(opts.qa === true ? { qa: true } : {}),
    ...(opts.qaSeverity !== undefined ? { qaSeverity: opts.qaSeverity } : {}),
  };
}

async function runCheck(
  rawOpts: unknown,
  deps: CliDeps,
  streams: Streams,
  settings?: TerminalSettings,
): Promise<number> {
  const context = commandContext("check", rawOpts, streams, settings);
  return withParsedOpts(
    () => parseCheckOpts(rawOpts),
    context,
    async (opts) => {
      const cwd = opts.cwd ?? process.cwd();
      return withWholeRunErrors(
        deps,
        context,
        loadOptions(opts.config !== undefined ? { config: opts.config } : {}, cwd),
        async (config) => {
          const summary = await withTask(context, "checking the locales", () =>
            deps.check(checkInput(config, cwd, opts)),
          );
          context.streams.out(
            context.json
              ? `${renderSuccessEnvelope("check", summary)}\n`
              : `${renderCheckHuman(summary)}\n`,
          );
          return checkExitCode(summary, opts.strict === true);
        },
      );
    },
  );
}

function hasConfirmedUnusedKeys(summary: DiffSummary): boolean {
  return summary.unused?.status === "complete" && summary.unused.unused.length > 0;
}

async function runDiff(
  rawOpts: unknown,
  deps: CliDeps,
  streams: Streams,
  settings?: TerminalSettings,
): Promise<number> {
  const context = commandContext("diff", rawOpts, streams, settings);
  return withLocaleOpts(diffOptsSchema, rawOpts, context, async (opts) => {
    const cwd = opts.cwd ?? process.cwd();
    return withWholeRunErrors(
      deps,
      context,
      loadOptions(opts.config !== undefined ? { config: opts.config } : {}, cwd),
      async (config) => {
        const label =
          opts.unused === true ? "diffing and scanning the source" : "diffing the locales";
        const summary = await withTask(context, label, (task) =>
          deps.diff({
            config,
            cwd,
            ...(opts.locales !== undefined ? { locales: opts.locales } : {}),
            ...(opts.unused === true ? { unused: true } : {}),
            onProgress: scanProgressReporter(task),
          }),
        );
        context.streams.out(
          context.json
            ? `${renderSuccessEnvelope("diff", summary)}\n`
            : `${renderDiffHuman(summary)}\n`,
        );
        if (summary.hasPendingChanges) {
          context.ui.hint(
            verbatraCommand(["translate"], opts),
            "send the pending keys to your provider",
          );
        }
        return summary.hasPendingChanges || hasConfirmedUnusedKeys(summary) ? 1 : 0;
      },
    );
  });
}

async function runPseudo(
  rawOpts: unknown,
  deps: CliDeps,
  streams: Streams,
  settings?: TerminalSettings,
): Promise<number> {
  const context = commandContext("pseudo", rawOpts, streams, settings);
  return withParsedOpts(
    () => parsePseudoCommandOpts(rawOpts),
    context,
    async (opts) => {
      const cwd = opts.cwd ?? process.cwd();
      topUpGitignore(cwd, context);
      return withWholeRunErrors(
        deps,
        context,
        loadOptions(opts.config !== undefined ? { config: opts.config } : {}, cwd),
        async (config) => {
          const result = await withTask(context, "pseudolocalizing the source", () =>
            deps.pseudolocalize({
              config,
              cwd,
              ...(opts.locale !== undefined ? { locale: opts.locale } : {}),
              ...(opts.out !== undefined ? { out: opts.out } : {}),
            }),
          );
          context.streams.out(
            context.json
              ? `${renderSuccessEnvelope("pseudo", result)}\n`
              : `${renderPseudoHuman(result, process.cwd())}\n`,
          );
          context.ui.hint(
            `load ${displayPath(result.path, process.cwd())} as the ${result.locale} locale in your dev server`,
          );
          return 0;
        },
      );
    },
  );
}

function configFilePaths(loaded: LoadedConfig): {
  readonly configPath?: string;
  readonly glossaryPath?: string;
} {
  return {
    ...(loaded.source.kind === "override" ? {} : { configPath: loaded.source.filepath }),
    ...(loaded.glossary.source === "file" ? { glossaryPath: loaded.glossary.path } : {}),
  };
}

function typesInput(
  loaded: LoadedConfig,
  cwd: string,
  opts: z.infer<typeof typesOptsSchema>,
): GenerateTypesInput {
  return {
    config: loaded.config,
    cwd,
    ...configFilePaths(loaded),
    ...(opts.out !== undefined ? { out: opts.out } : {}),
    ...(opts.check === true ? { check: true } : {}),
  };
}

async function runTypes(
  rawOpts: unknown,
  deps: CliDeps,
  streams: Streams,
  settings?: TerminalSettings,
): Promise<number> {
  const context = commandContext("types", rawOpts, streams, settings);
  return withParsedOpts(
    () => parseTypesCommandOpts(rawOpts),
    context,
    async (opts) => {
      const cwd = opts.cwd ?? process.cwd();
      return withLoadedRunErrors(
        context,
        () =>
          deps.loadConfigWithMeta(
            loadOptions(opts.config !== undefined ? { config: opts.config } : {}, cwd),
          ),
        async (loaded) => {
          const label =
            opts.check === true ? "checking the declarations" : "generating the declarations";
          const result = await withTask(context, label, () =>
            deps.generateTypes(typesInput(loaded, cwd, opts)),
          );
          context.streams.out(
            context.json
              ? `${renderSuccessEnvelope("types", result)}\n`
              : `${renderTypesHuman(result, process.cwd())}\n`,
          );
          if (result.written) {
            context.ui.hint(
              `commit ${displayPath(result.path, process.cwd())}`,
              "verbatra types --check compares against it in CI",
            );
          }
          return result.check && result.stale ? 1 : 0;
        },
      );
    },
  );
}

const doctorOptsSchema = sharedCommandOptsSchema.extend({
  literals: z.boolean().optional(),
});

async function runDoctor(
  rawOpts: unknown,
  deps: CliDeps,
  streams: Streams,
  settings?: TerminalSettings,
): Promise<number> {
  const context = commandContext("doctor", rawOpts, streams, settings);
  return withParsedOpts(
    () => doctorOptsSchema.parse(rawOpts),
    context,
    async (opts) => {
      const cwd = opts.cwd ?? process.cwd();
      const literals = opts.literals === true;
      try {
        if (!literals) {
          loadEnvFiles(cwd);
        }
        const label = literals ? "scanning the source for literals" : "checking the setup";
        const result = await withTask(context, label, (task) =>
          deps.doctor({
            cwd,
            ...(opts.config !== undefined ? { configPath: opts.config } : {}),
            ...(literals ? { literals: true, onProgress: scanProgressReporter(task) } : {}),
          }),
        );
        context.streams.out(
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
  readonly settings: () => TerminalSettings;
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
      "--max-tokens <n>",
      "hard token ceiling for this run; the lower of this and the config's maxTokens applies",
    )
    .option(
      "--no-cache",
      "bypass the local translation-memory cache (verbatra.cache.json) for this run",
    )
    .option(
      "--include-human",
      "also retranslate stale keys a person wrote or imported (humanEdits: overwrite for this run)",
    )
    .option("--json", "print the run summary as JSON")
    .option(
      "--estimate",
      "estimate what the run would send and cost, then exit without calling a provider (implies --dry-run)",
    )
    .action(async (opts: unknown) => {
      ctx.hooks.onLockingCommand?.();
      ctx.setCode(await runTranslate(opts, ctx.deps, ctx.streams, ctx.settings()));
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
        "  $ verbatra translate --estimate      size and price the run without spending anything",
        "  $ verbatra translate --max-tokens 50000  stop before the run passes 50000 tokens",
        "  $ verbatra translate --include-human retranslate stale keys a person wrote, too",
        "",
        "Stale keys a person wrote or imported are kept and reported as protected, unless the",
        'config sets humanEdits: "overwrite" or --include-human is passed. pinnedKeys are never',
        "machine-translated.",
        "",
        'With provider "none", keys are filled from the translation memory only; the run exits 3',
        "when any key still needs a human translation.",
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
      ctx.setCode(await runWatchCommand(opts, ctx.deps, ctx.streams, ctx.hooks, ctx.settings()));
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
      ctx.setCode(await runExport(opts, ctx.deps, ctx.streams, ctx.settings()));
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
    .option(
      "--lock-timeout <seconds>",
      "how long to wait for a held per-locale write lock before failing (default 600)",
    )
    .option("--json", "print the run summary as JSON")
    .action(async (workbook: string, opts: unknown) => {
      ctx.hooks.onLockingCommand?.();
      ctx.setCode(await runImport(workbook, opts, ctx.deps, ctx.streams, ctx.settings()));
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

function registerTmxCommand(program: Command, ctx: ProgramContext): void {
  program
    .command("tmx")
    .argument("<direction>", 'either "import" or "export"')
    .argument(
      "[file]",
      `the TMX file to read or write (default ${DEFAULT_TMX_PATH} in the working directory)`,
    )
    .description(
      "Import a TMX translation memory from another tool, or export this project's memory as TMX",
    )
    .option("--cwd <path>", "resolve config and the memory from this directory")
    .option("--config <path>", "load this config file instead of searching for one")
    .option("--locales <list>", "comma-separated subset of target locales (default all configured)")
    .option("--dry-run", "on import, validate and report without changing the memory")
    .option(
      "--overwrite",
      "on import, let an imported unit replace a translation the memory already holds",
    )
    .option("--json", "print the result as JSON")
    .action(async (direction: string, file: string | undefined, opts: unknown) => {
      ctx.setCode(await runTmx(direction, file, opts, ctx.deps, ctx.streams, ctx.settings()));
    })
    .addHelpText(
      "after",
      [
        "",
        "Examples:",
        "  $ verbatra tmx import legacy.tmx        land another tool's memory in this project",
        "  $ verbatra tmx import legacy.tmx --dry-run  report what would land, change nothing",
        "  $ verbatra tmx import legacy.tmx --overwrite  let the file win where the two disagree",
        "  $ verbatra tmx export                   write the memory to verbatra-memory.tmx",
        "  $ verbatra tmx export out/memory.tmx --locales de  only German, to a chosen path",
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
    .option(
      "--consistency",
      "also report source strings translated more than one way (report only, exit code unchanged)",
    )
    .option(
      "--qa",
      "also run the integrity and review checks on every committed translation (exit 1 on errors)",
    )
    .option("--severity <level>", "lowest quality-check severity to report: error or warning")
    .option("--strict", "with --qa, also exit 1 when the quality check reports warnings")
    .option("--json", "print the check summary as JSON")
    .action(async (opts: unknown) => {
      ctx.setCode(await runCheck(opts, ctx.deps, ctx.streams, ctx.settings()));
    })
    .addHelpText(
      "after",
      [
        "",
        "Examples:",
        "  $ verbatra check                  report missing and stale keys per locale (exit 1 if drifted)",
        "  $ verbatra check --locales de,fr  only check the German and French locales",
        "  $ verbatra check --json           machine-readable status on stdout for CI",
        "  $ verbatra check --consistency    also list source strings translated more than one way",
        "  $ verbatra check --qa             also check placeholders, markup, ICU and review flags",
        "  $ verbatra check --qa --strict    fail on quality-check warnings too, not only errors",
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
    .option(
      "--unused",
      "also report source-locale keys no source reference names, using the extract block's roots",
    )
    .option("--json", "print the diff summary as JSON")
    .action(async (opts: unknown) => {
      ctx.setCode(await runDiff(opts, ctx.deps, ctx.streams, ctx.settings()));
    })
    .addHelpText(
      "after",
      [
        "",
        "Examples:",
        "  $ verbatra diff                  list the pending keys per locale (exit 1 if any are pending)",
        "  $ verbatra diff --locales de,fr  only diff the German and French locales",
        "  $ verbatra diff --unused         also list unused source keys (exit 1 only on a complete scan)",
        "  $ verbatra diff --json           machine-readable key lists on stdout for CI",
      ].join("\n"),
    );
}

function registerPseudoCommand(program: Command, ctx: ProgramContext): void {
  program
    .command("pseudo")
    .description("Generate a pseudolocale from the source strings without calling a provider")
    .option("--cwd <path>", "resolve config and locale files from this directory")
    .option("--config <path>", "load this config file instead of searching for one")
    .option("--locale <code>", "pseudolocale code to generate (default en-XA)")
    .option(
      "--out <path>",
      "directory to write the pseudolocale under, relative to the working directory and inside it (default .verbatra-local/pseudo)",
    )
    .option("--json", "print the pseudolocale result as JSON")
    .action(async (opts: unknown) => {
      ctx.setCode(await runPseudo(opts, ctx.deps, ctx.streams, ctx.settings()));
    })
    .addHelpText(
      "after",
      [
        "",
        "Examples:",
        "  $ verbatra pseudo                     generate en-XA under .verbatra-local/pseudo",
        "  $ verbatra pseudo --locale en-XB      generate a second pseudolocale instead",
        "  $ verbatra pseudo --out build/pseudo  write it somewhere your dev server serves",
        "  $ verbatra pseudo --json              machine-readable result on stdout",
        "",
        "It constructs no provider, reads no API key and makes no network request, so it runs " +
          "before any key exists.",
      ].join("\n"),
    );
}

function registerTypesCommand(program: Command, ctx: ProgramContext): void {
  program
    .command("types")
    .description("Generate TypeScript declarations for your catalog keys and message arguments")
    .option("--cwd <path>", "resolve config and locale files from this directory")
    .option("--config <path>", "load this config file instead of searching for one")
    .option(
      "--out <path>",
      `write the declaration here, relative to the working directory and inside it (default ${DEFAULT_TYPES_PATH})`,
    )
    .option("--check", "report whether the committed declaration is current, writing nothing")
    .option("--json", "print the generation result as JSON")
    .action(async (opts: unknown) => {
      ctx.setCode(await runTypes(opts, ctx.deps, ctx.streams, ctx.settings()));
    })
    .addHelpText(
      "after",
      [
        "",
        "Examples:",
        `  $ verbatra types                       write ${DEFAULT_TYPES_PATH} from the source catalog`,
        "  $ verbatra types --out src/messages.d.ts  write it somewhere your app already imports from",
        "  $ verbatra types --check               exit 1 if the committed declaration is stale (for CI)",
        "  $ verbatra types --json                machine-readable result on stdout",
        "",
        "It constructs no provider, reads no API key and makes no network request, so it runs " +
          "before any key exists.",
      ].join("\n"),
    );
}

function registerDoctorCommand(program: Command, ctx: ProgramContext): void {
  program
    .command("doctor")
    .description("Validate the project setup without calling a provider or reading an API key")
    .option("--cwd <path>", "resolve config and locale files from this directory")
    .option("--config <path>", "load this config file instead of searching for one")
    .option(
      "--literals",
      "scan the extract source roots for hardcoded user-facing strings instead of checking the setup",
    )
    .option("--json", "print the doctor report as JSON")
    .action(async (opts: unknown) => {
      ctx.setCode(await runDoctor(opts, ctx.deps, ctx.streams, ctx.settings()));
    })
    .addHelpText(
      "after",
      [
        "",
        "Examples:",
        "  $ verbatra doctor             report every setup problem at once (exit 1 if any)",
        "  $ verbatra doctor --json      machine-readable report on stdout for CI",
        "  $ verbatra doctor --literals  list untranslated string literals (exit 1 if any)",
        "",
        "With --literals it reads your source and never writes it, constructs no provider, and " +
          "reads no API key, so it runs before any key exists.",
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
    .option(
      "--verbose",
      "also print one stderr line per request, token masked (never Studio's startup banner)",
    )
    .action(async (opts: unknown) => {
      ctx.setCode(await runStudioCommand(opts, ctx.deps, ctx.streams, ctx.hooks, ctx.settings()));
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
      ctx.setCode(await runMcpCommand(opts, ctx.deps, ctx.streams, ctx.hooks, ctx.settings()));
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
      "translation provider to use: anthropic, openai, gemini, deepl, google-translate, " +
        "openai-compatible, or none to disable machine translation (required unless prompted)",
    )
    .option(
      "--format <id>",
      "locale file format (default: detected from your locale files and dependencies)",
    )
    .option(
      "--source <locale>",
      "locale your source strings are written in (default: detected, else en)",
    )
    .option(
      "--targets <locales>",
      "comma-separated locales to translate into (default: detected, else de)",
    )
    .option(
      "--path <pattern>",
      "locale file pattern containing the {locale} token (default: detected, else locales/{locale}.json)",
    )
    .option("--model <name>", "model to use (required for openai-compatible)")
    .option("--base-url <url>", "server URL for openai-compatible (required for it)")
    .option(
      "--api-key-env-var <name>",
      "environment variable openai-compatible reads its key from (never the key itself)",
    )
    .option("--yes", "skip prompts and accept the defaults for anything not passed or detected")
    .option("--force", "overwrite an existing verbatra.config.ts that differs")
    .option("--json", "print one JSON document describing what was written; never prompts")
    .action(async (opts: InitOpts) => {
      ctx.setCode(await runInit(opts, ctx.streams));
    })
    .addHelpText(
      "after",
      [
        "",
        "Examples:",
        "  $ verbatra init --provider anthropic        create config + .env example, prompting for the rest",
        "  $ verbatra init --provider deepl --yes      non-interactive, detect or default the rest",
        "  $ verbatra init --provider gemini --format yaml --path 'i18n/{locale}.yml' --yes --json",
        "  $ verbatra init --provider openai-compatible --base-url http://localhost:11434/v1 --model llama3.1 --yes",
        "  $ verbatra init --provider none --yes       human-only: no provider, no API key",
      ].join("\n"),
    );
}

const extractOptsSchema = sharedCommandOptsSchema.extend({
  dryRun: z.boolean().optional(),
});

async function runExtract(
  rawOpts: unknown,
  deps: CliDeps,
  streams: Streams,
  settings?: TerminalSettings,
): Promise<number> {
  const context = commandContext("extract", rawOpts, streams, settings);
  return withParsedOpts(
    () => extractOptsSchema.parse(rawOpts),
    context,
    async (opts) => {
      const cwd = opts.cwd ?? process.cwd();
      return withWholeRunErrors(
        deps,
        context,
        loadOptions(opts.config !== undefined ? { config: opts.config } : {}, cwd),
        async (config) => {
          const result = await withTask(context, "scanning the source", (task) =>
            deps.extract({
              config,
              cwd,
              ...(opts.dryRun === true ? { dryRun: true } : {}),
              onProgress: scanProgressReporter(task),
            }),
          );
          context.streams.out(
            context.json
              ? `${renderSuccessEnvelope("extract", result)}\n`
              : `${renderExtractHuman(result)}\n`,
          );
          if (result.added.length > 0) {
            if (result.dryRun) {
              context.ui.hint(
                verbatraCommand(["extract"], opts),
                "without --dry-run to write the new keys",
              );
            } else {
              context.ui.hint(verbatraCommand(["translate"], opts), "translate the new keys");
            }
          }
          return 0;
        },
      );
    },
  );
}

function registerExtractCommand(program: Command, ctx: ProgramContext): void {
  program
    .command("extract")
    .description(
      "Scan your source for translation call sites and add new keys to the source locale",
    )
    .option("--cwd <path>", "resolve config and locale files from this directory")
    .option("--config <path>", "load this config file instead of searching for one")
    .option("--dry-run", "report what would be added without writing the source locale file")
    .option("--json", "print the extraction result as JSON")
    .action(async (opts: unknown) => {
      ctx.setCode(await runExtract(opts, ctx.deps, ctx.streams, ctx.settings()));
    })
    .addHelpText(
      "after",
      [
        "",
        "Examples:",
        "  $ verbatra extract            add every new key found in your source to the source locale",
        "  $ verbatra extract --dry-run  preview the keys that would be added, write nothing",
        "  $ verbatra extract --json     machine-readable result on stdout for CI",
      ].join("\n"),
    );
}

const globalOptsSchema = z.object({
  quiet: z.boolean().optional(),
  color: z.boolean().optional(),
});

function buildProgram(
  deps: CliDeps,
  streams: Streams,
  hooks: RunHooks,
  setCode: (code: number) => void,
  facts: TerminalFacts,
): Command {
  const program = new Command();
  program
    .name("verbatra")
    .description(
      "Automate i18n translation and keep your locale files in sync, using a hosted or local AI or machine-translation provider",
    )
    .version(CLI_VERSION)
    .option("-q, --quiet", "print only results, warnings and errors: no progress, notices or hints")
    .option("--no-color", "never color the output (also: NO_COLOR, VERBATRA_NO_COLOR)")
    .exitOverride()
    .configureOutput({ writeOut: (s) => streams.out(s), writeErr: (s) => streams.err(s) });

  const settings = (): TerminalSettings => {
    const global = globalOptsSchema.parse(program.opts());
    return { facts, quiet: global.quiet === true, color: global.color !== false };
  };
  const ctx: ProgramContext = { deps, streams, hooks, setCode, settings };
  registerTranslateCommand(program, ctx);
  registerWatchCommand(program, ctx);
  registerExportCommand(program, ctx);
  registerImportCommand(program, ctx);
  registerTmxCommand(program, ctx);
  registerCheckCommand(program, ctx);
  registerDiffCommand(program, ctx);
  registerPseudoCommand(program, ctx);
  registerTypesCommand(program, ctx);
  registerDoctorCommand(program, ctx);
  registerStudioCommand(program, ctx);
  registerMcpCommand(program, ctx);
  registerInitCommand(program, ctx);
  registerExtractCommand(program, ctx);

  return program;
}

export async function run(
  argv: readonly string[],
  deps: CliDeps,
  streams: Streams,
  hooks: RunHooks = {},
  facts: TerminalFacts = DEFAULT_TERMINAL_SETTINGS.facts,
): Promise<number> {
  return runRedacted(argv, deps, redactingStreams(streams), hooks, facts);
}

function suggestInitWithoutConfig(streams: Streams): void {
  if (!hasConfigFile(process.cwd())) {
    streams.err(
      "\nverbatra: no config found in this directory. Run verbatra init to set up this project.\n",
    );
  }
}

async function runRedacted(
  argv: readonly string[],
  deps: CliDeps,
  streams: Streams,
  hooks: RunHooks,
  facts: TerminalFacts,
): Promise<number> {
  let code = 0;
  const program = buildProgram(
    deps,
    streams,
    hooks,
    (c) => {
      code = c;
    },
    facts,
  );
  try {
    await program.parseAsync([...argv], { from: "user" });
  } catch (error) {
    if (error instanceof CommanderError) {
      if (error.exitCode === 0) {
        return 0;
      }
      if (argv.length === 0) {
        suggestInitWithoutConfig(streams);
      }
      return renderUsageFailureExit2(error, program, argv, streams);
    }
    throw error;
  }
  return code;
}
