import { dirname, isAbsolute, relative, resolve } from "node:path";
import {
  type CheckFileInput,
  type CheckFileSummary,
  type CheckInput,
  type CheckSummary,
  DEFAULT_EXCHANGE_FORMAT,
  DEFAULT_TMX_PATH,
  DEFAULT_TYPES_PATH,
  type DiffSummary,
  type DoctorCheckStatus,
  EXCHANGE_FORMATS,
  type ExchangeFormat,
  type ExportWorkbookInput,
  type ExportWorkbookResult,
  errorHint,
  type GenerateTypesInput,
  type ImportWorkbookInput,
  isMachineTranslationEnabled,
  type LoadedConfig,
  type LockWaitEvent,
  type ProgressEvent,
  type ProvenanceReport,
  PSEUDO_MODES,
  type PseudoMode,
  QA_SEVERITIES,
  type QaSeverity,
  type RunSummary,
  resolveDryRun,
  resolveProjectRoot,
  type TranslateInput,
  type VerbatraConfig,
} from "@verbatra/sdk";
import { Argument, Command, CommanderError } from "commander";
import { z } from "zod";
import { AGENT_CLIENT_CONFIGS, AGENT_CLIENT_IDS, CLIENT_FLAG_VALUES } from "./agent-clients.js";
import type { CliErrorCode } from "./cli-error-codes.js";
import { usageErrorHint } from "./cli-error-hints.js";
import { CliUsageError } from "./cli-usage-error.js";
import { hasConfigFile } from "./config-presence.js";
import { assertCwdDirectory } from "./cwd-option.js";
import { loadEnvFiles } from "./env.js";
import { appendMissingGitignoreEntries } from "./gitignore.js";
import { runInit } from "./init.js";
import { renderErrorEnvelope, renderSuccessEnvelope } from "./json-envelope.js";
import { runMcp } from "./mcp-command.js";
import { readPackageManifest } from "./package-manifest.js";
import { parsePositiveIntegerOption } from "./positive-integer-option.js";
import { createProgressPresenter, scanProgressReporter } from "./progress-presenter.js";
import { escapesProject, LINK_OUTSIDE_PROJECT } from "./project-paths.js";
import { redactingStreams } from "./redacting-streams.js";
import {
  displayPath,
  renderCheckFileHuman,
  renderCheckHuman,
  renderDiffHuman,
  renderDoctorHuman,
  renderExportHuman,
  renderExtractHuman,
  renderHuman,
  renderLockWait,
  renderProvenanceReportHuman,
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
import { createUi, formatElapsed, type StatusWord, type Task, type Ui } from "./ui.js";
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
  reviewer: z.string().optional(),
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

const REPORT_KINDS = ["provenance"] as const;

const reportOptsSchema = sharedCommandOptsSchema.extend({
  locales: localeListSchema,
});

const checkOptsSchema = sharedCommandOptsSchema.extend({
  locales: localeListSchema,
  consistency: z.boolean().optional(),
  qa: z.boolean().optional(),
  severity: z.string().optional(),
  strict: z.boolean().optional(),
  requireReviewed: z.boolean().optional(),
  sensitive: z.boolean().optional(),
  file: z.string().optional(),
});

type CheckOpts = z.infer<typeof checkOptsSchema>;

function runsQualityCheck(opts: CheckOpts): boolean {
  return opts.qa === true || opts.file !== undefined;
}

function parseQaSeverity(opts: CheckOpts): QaSeverity | undefined {
  if (!runsQualityCheck(opts) && (opts.severity !== undefined || opts.strict === true)) {
    const given = opts.severity !== undefined ? "--severity" : "--strict";
    throw new CliUsageError(
      "INVALID_QA_OPTION",
      `${given} applies to the quality check only. Add --qa, or --file to check one file.`,
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

const PROJECT_WIDE_CHECK_FLAGS = [
  ["--locales", (opts: CheckOpts) => opts.locales !== undefined],
  ["--consistency", (opts: CheckOpts) => opts.consistency === true],
  ["--require-reviewed", (opts: CheckOpts) => opts.requireReviewed === true],
  ["--sensitive", (opts: CheckOpts) => opts.sensitive === true],
] as const;

function assertFileCheckOpts(opts: CheckOpts): void {
  if (opts.file === undefined) {
    return;
  }
  if (opts.file.trim() === "") {
    throw new CliUsageError(
      "INVALID_OPTION",
      "The --file option was provided but names no file. Pass the path of one locale file.",
    );
  }
  const given = PROJECT_WIDE_CHECK_FLAGS.filter(([, isGiven]) => isGiven(opts)).map(
    ([flag]) => flag,
  );
  if (given.length > 0) {
    throw new CliUsageError(
      "INVALID_OPTION",
      `${given.join(", ")} cannot be combined with --file, which checks the one locale the file holds. Drop ${given.length === 1 ? "it" : "them"}, or drop --file to check the whole project.`,
    );
  }
}

function parseCheckOpts(rawOpts: unknown): CheckOpts & { readonly qaSeverity?: QaSeverity } {
  const opts = parseLocaleCommandOpts(checkOptsSchema, rawOpts);
  assertFileCheckOpts(opts);
  const qaSeverity = parseQaSeverity(opts);
  return qaSeverity !== undefined ? { ...opts, qaSeverity } : opts;
}

function hasIncompletePlurals(summary: CheckSummary): boolean {
  return summary.locales.some((locale) => (locale.incompletePlurals?.length ?? 0) > 0);
}

function checkExitCode(summary: CheckSummary, strict: boolean): number {
  const qa = summary.qa;
  const warns = (qa?.warnings ?? 0) > 0 || hasIncompletePlurals(summary);
  const qaFails = qa !== undefined && (qa.errors > 0 || (strict && warns));
  const reviewFails = summary.review !== undefined && !summary.review.reviewed;
  const sensitive = summary.sensitive;
  const sensitiveFails =
    sensitive !== undefined && sensitive.findings.length + sensitive.glossaryTerms > 0;
  return summary.inSync && !qaFails && !reviewFails && !sensitiveFails ? 0 : 1;
}

function fileHasIncompletePlurals(summary: CheckFileSummary): boolean {
  return summary.locales.some((locale) => locale.incompletePlurals.length > 0);
}

function checkFileExitCode(summary: CheckFileSummary, strict: boolean): number {
  const warns = summary.qa.warnings > 0 || fileHasIncompletePlurals(summary);
  return summary.qa.errors > 0 || (strict && warns) ? 1 : 0;
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
  mode: z.string().optional(),
  locale: z.string().optional(),
  out: z.string().optional(),
});

function parsePseudoMode(mode: string | undefined): PseudoMode | undefined {
  if (mode === undefined) {
    return undefined;
  }
  const known = PSEUDO_MODES.find((candidate) => candidate === mode);
  if (known === undefined) {
    throw new CliUsageError(
      "INVALID_OPTION",
      `The --mode option takes ${PSEUDO_MODES.map((candidate) => `"${candidate}"`).join(" or ")}, got "${mode}".`,
    );
  }
  return known;
}

function parsePseudoCommandOpts(
  rawOpts: unknown,
): Omit<z.infer<typeof pseudoOptsSchema>, "mode"> & { readonly mode?: PseudoMode } {
  const { mode: rawMode, ...opts } = pseudoOptsSchema.parse(rawOpts);
  const mode = parsePseudoMode(rawMode);
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
  return mode !== undefined ? { ...opts, mode } : opts;
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
  command: string | null,
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
  if (escapesProject(cwd, ".gitignore")) {
    context.ui.warn(`left .gitignore unchanged: it ${LINK_OUTSIDE_PROJECT}`);
    return;
  }
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

const PROTOCOL_STDOUT_COMMANDS: ReadonlySet<string> = new Set(["mcp"]);

function discardCommanderError(): void {}

function commanderErrorText(error: CommanderError): string {
  return error.message
    .replace(/^error: /, "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .join(" ")
    .replace("(Did you mean", "(did you mean");
}

function argvRequestsQuiet(argv: readonly string[]): boolean {
  return argv.includes("-q") || argv.includes("--quiet");
}

function showsHelp(error: CommanderError): boolean {
  return error.code.startsWith("commander.help");
}

function hintUsage(
  error: CommanderError,
  hint: string,
  argv: readonly string[],
  streams: Streams,
  facts: TerminalFacts,
): void {
  if (showsHelp(error) || argv.length === 0) {
    return;
  }
  const terminal = resolveTerminalMode(facts, {
    json: false,
    quiet: argvRequestsQuiet(argv),
    color: !argv.includes("--no-color"),
  });
  createUi(streams, terminal).hint(hint);
}

function renderUsageFailureExit2(
  error: CommanderError,
  program: Command,
  argv: readonly string[],
  streams: Streams,
  facts: TerminalFacts,
): number {
  const command = resolveCommandName(program, argv);
  const hint = usageErrorHint(command);
  if (command !== null && PROTOCOL_STDOUT_COMMANDS.has(command)) {
    if (argvRequestsJson(argv)) {
      streams.err(
        `verbatra: error [${USAGE_ERROR_CODE}] ${command} does not take --json: its stdout carries ` +
          "only MCP protocol messages, so it never prints a JSON envelope. Remove --json.\n",
      );
    } else {
      streams.err(`verbatra: error [${USAGE_ERROR_CODE}] ${commanderErrorText(error)}\n`);
      hintUsage(error, hint, argv, streams, facts);
    }
    return 2;
  }
  if (argvRequestsJson(argv)) {
    const envelope = renderErrorEnvelope(command, {
      code: USAGE_ERROR_CODE,
      message: error.message,
      hint,
    });
    streams.out(`${envelope}\n`);
  } else {
    hintUsage(error, hint, argv, streams, facts);
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

function tmxImportFlagArgs(opts: {
  readonly overwrite?: boolean | undefined;
  readonly locales?: readonly string[] | undefined;
}): readonly string[] {
  return [
    ...(opts.overwrite === true ? ["--overwrite"] : []),
    ...(opts.locales !== undefined ? ["--locales", opts.locales.join(",")] : []),
  ];
}

function formatArgs(format: ExchangeFormat | undefined): readonly string[] {
  return format === undefined ? [] : ["--format", format];
}

function loadOptions(opts: SharedOpts, cwd: string): { cwd: string; configPath?: string } {
  return {
    cwd,
    ...(opts.config !== undefined ? { configPath: opts.config } : {}),
  };
}

interface LoadedProject {
  readonly loaded: LoadedConfig;
  readonly root: string;
}

async function loadProject(
  deps: CliDeps,
  loadOpts: { cwd: string; configPath?: string },
  ui: Ui,
): Promise<LoadedProject> {
  const loaded = await deps.loadConfigWithMeta(loadOpts);
  const root = resolveProjectRoot(loaded.source, loadOpts.cwd);
  noteConfigOutsideRoot(loaded, root, ui);
  return { loaded, root };
}

function noteConfigOutsideRoot(loaded: LoadedConfig, root: string, ui: Ui): void {
  if (loaded.source.kind !== "explicit") {
    return;
  }
  const configDir = dirname(loaded.source.filepath);
  if (configDir === resolve(root)) {
    return;
  }
  ui.info(
    `--config names a file in ${displayPath(configDir, process.cwd()) || "."}: locale, lock and cache paths resolve against ${displayPath(resolve(root), process.cwd()) || "."}, the glossary against the config's directory`,
  );
}

function invocationPath(path: string, cwd: string, root: string): string {
  return root === cwd || isAbsolute(path) ? path : relative(root, resolve(cwd, path)) || ".";
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
  body: (config: VerbatraConfig, root: string) => Promise<number>,
  beforeLoad?: () => void,
): Promise<number> {
  return withLoadedRunErrors(
    context,
    () => loadProject(deps, loadOpts, context.ui),
    ({ loaded, root }) => body(loaded.config, root),
    beforeLoad,
  );
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

const IMPORT_FORMAT_OPTION_DESCRIPTION = `handoff format: one of ${EXCHANGE_FORMATS.join(
  ", ",
)} (default from the path's extension: csv, tsv, xliff2 for .xlf or .xliff, otherwise ${DEFAULT_EXCHANGE_FORMAT}; for a directory, from the export manifest or locale files inside; either XLIFF format reads both versions)`;

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

function progressReporter(
  context: CommandContext,
  dryRun: boolean,
): (event: ProgressEvent) => void {
  return createProgressPresenter(context.ui, { json: context.json, base: process.cwd(), dryRun });
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

const HAND_OFF_PURPOSE =
  "hand the keys that need a person to a translator, or edit them in verbatra studio";

function wouldWriteAnything(summary: RunSummary): boolean {
  return summary.locales.some((locale) => locale.translated.length > 0);
}

function dryRunHint(
  context: CommandContext,
  opts: LocationOpts,
  summary: RunSummary,
  machineTranslation: boolean,
): void {
  if (!machineTranslation && !wouldWriteAnything(summary)) {
    context.ui.hint(verbatraCommand(["check"], opts), "confirm every locale is in sync");
    return;
  }
  context.ui.hint(verbatraCommand(["translate"], opts), "run it for real");
}

function reportTranslateOutcome(
  context: CommandContext,
  opts: LocationOpts,
  run: { readonly summary: RunSummary; readonly machineTranslation: boolean },
  exitCode: number,
  startedAt: number,
): void {
  const { summary } = run;
  const elapsed = formatElapsed(Date.now() - startedAt);
  const handOff = (): void => context.ui.hint(verbatraCommand(["export"], opts), HAND_OFF_PURPOSE);
  if (summary.dryRun) {
    context.ui.status("ok", `dry run done in ${elapsed}, nothing written`);
    if (exitCode === NEEDS_HUMAN_EXIT_CODE) {
      handOff();
      return;
    }
    dryRunHint(context, opts, summary, run.machineTranslation);
    return;
  }
  if (exitCode === 0) {
    context.ui.status("ok", `done in ${elapsed}${usagePhrase(summary)}`);
    context.ui.hint(verbatraCommand(["check"], opts), "confirm every locale is in sync");
    return;
  }
  context.ui.status("warn", `finished in ${elapsed}${usagePhrase(summary)}, see the summary above`);
  if (exitCode === NEEDS_HUMAN_EXIT_CODE) {
    handOff();
  }
}

function announceOnce(announce: () => void): () => void {
  let announced = false;
  return () => {
    if (!announced) {
      announced = true;
      announce();
    }
  };
}

function buildTranslateInput(
  opts: ParsedTranslateOpts,
  config: TranslateInput["config"],
  cwd: string,
  context: CommandContext,
  announceStart: () => void,
): TranslateInput {
  const report = progressReporter(context, resolveDryRun(opts));
  const reportLockWait = lockWaitReporter(context);
  return {
    config,
    cwd,
    onLockWait: (event) => {
      announceStart();
      reportLockWait(event);
    },
    onProgress: (event) => {
      announceStart();
      report(event);
    },
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
      return withWholeRunErrors(
        deps,
        context,
        loadOptions(opts.config !== undefined ? { config: opts.config } : {}, cwd),
        async (config, root) => {
          topUpGitignore(root, context, resolveDryRun(opts));
          const startedAt = Date.now();
          const announceStart = announceOnce(() =>
            context.ui.info(translateStartLine(opts, config)),
          );
          const summary = await deps.translate(
            buildTranslateInput(opts, config, root, context, announceStart),
          );
          announceStart();
          context.streams.out(
            context.json
              ? `${renderSuccessEnvelope("translate", summary)}\n`
              : `${renderHuman(summary)}\n`,
          );
          renderNeedsHumanHint(config, summary, opts.includeHuman === true, context.ui);
          const exitCode = translateExitCode(config, summary);
          reportTranslateOutcome(
            context,
            opts,
            { summary, machineTranslation: isMachineTranslationEnabled(config) },
            exitCode,
            startedAt,
          );
          return exitCode;
        },
        () => loadEnvFiles(cwd, opts.config),
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
      let project: LoadedProject;
      try {
        loadEnvFiles(cwd, opts.config);
        project = await loadProject(
          deps,
          loadOptions(opts.config !== undefined ? { config: opts.config } : {}, cwd),
          context.ui,
        );
      } catch (error) {
        return renderFailureExit2(error, context);
      }
      topUpGitignore(project.root, context);
      const session = runWatch(
        {
          config: project.loaded.config,
          json: context.json,
          cwd: project.root,
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
  let announced = false;
  const session = await runMcp(rawOpts, deps, streams, settings, (started) => {
    announced = true;
    hooks.onMcpSession?.(started);
  });
  if (!announced) {
    hooks.onMcpSession?.(session);
  }
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
  opts: LocationOpts & { readonly format: ExchangeFormat | undefined },
  cwd: string,
  result: ExportWorkbookResult,
): void {
  if (result.locales.some((locale) => locale.rows > 0)) {
    context.ui.hint(
      verbatraCommand(["import", displayPath(result.path, cwd), ...formatArgs(opts.format)], opts),
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
          loadProject(
            deps,
            loadOptions(opts.config !== undefined ? { config: opts.config } : {}, cwd),
            context.ui,
          ),
        async ({ loaded, root }) => {
          const out = opts.out === undefined ? undefined : invocationPath(opts.out, cwd, root);
          const result = await withTask(
            context,
            `exporting to ${opts.format ?? DEFAULT_EXCHANGE_FORMAT}`,
            () => deps.exportWorkbook(exportInput(loaded, root, { ...opts, out })),
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

interface ImportRunOpts extends LocationOpts {
  readonly dryRun?: boolean | undefined;
  readonly format: ExchangeFormat | undefined;
  readonly reviewer?: string | undefined;
  readonly lockAcquireTimeoutMs: number | undefined;
}

function importInput(
  config: VerbatraConfig,
  workbook: string,
  cwd: string,
  opts: ImportRunOpts,
  context: CommandContext,
): ImportWorkbookInput {
  return {
    config,
    workbook,
    cwd,
    onLockWait: lockWaitReporter(context),
    ...(opts.dryRun === true ? { dryRun: true } : {}),
    ...(opts.format !== undefined ? { format: opts.format } : {}),
    ...(opts.reviewer !== undefined ? { reviewer: opts.reviewer } : {}),
    ...(opts.lockAcquireTimeoutMs !== undefined
      ? { lockAcquireTimeoutMs: opts.lockAcquireTimeoutMs }
      : {}),
  };
}

function hintAfterImport(
  context: CommandContext,
  workbook: string,
  opts: ImportRunOpts,
  summary: RunSummary,
  exitCode: number,
): void {
  const reviewerArgs = opts.reviewer !== undefined ? ["--reviewer", opts.reviewer] : [];
  const reimport = verbatraCommand(
    ["import", workbook, ...formatArgs(opts.format), ...reviewerArgs],
    opts,
  );
  if (summary.dryRun) {
    context.ui.hint(reimport, "without --dry-run to write the files");
  } else if (exitCode === 0) {
    context.ui.hint(verbatraCommand(["check"], opts), "confirm every locale is in sync");
  } else {
    hintAfterUnsettledImport(context, reimport, summary);
  }
}

function hintAfterUnsettledImport(
  context: CommandContext,
  reimport: string,
  summary: RunSummary,
): void {
  const unsettled = summary.locales.filter((locale) => locale.status !== "succeeded");
  if (unsettled.some((locale) => locale.integrityMismatches.length > 0)) {
    context.ui.hint(reimport, "after correcting the rows listed above");
    return;
  }
  const causeHint = unsettled
    .map((locale) => (locale.error === undefined ? undefined : errorHint(locale.error)))
    .find((hint) => hint !== undefined);
  if (causeHint !== undefined) {
    context.ui.hint(causeHint);
  }
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
      return withWholeRunErrors(
        deps,
        context,
        loadOptions(opts.config !== undefined ? { config: opts.config } : {}, cwd),
        async (config, root) => {
          topUpGitignore(root, context, opts.dryRun);
          const input = invocationPath(workbook, cwd, root);
          const summary = await withTask(context, `importing ${workbook}`, () =>
            deps.importWorkbook(importInput(config, input, root, opts, context)),
          );
          context.streams.out(
            context.json
              ? `${renderSuccessEnvelope("import", summary)}\n`
              : `${renderHuman(summary, "import")}\n`,
          );
          const exitCode = runExitCode(summary);
          hintAfterImport(context, workbook, opts, summary, exitCode);
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
    async (config, root) => {
      topUpGitignore(root, context, opts.dryRun);
      const source = file ?? DEFAULT_TMX_PATH;
      const result = await withTask(context, `importing ${source} into the memory`, () =>
        deps.importTmx({
          config,
          cwd: root,
          file: file === undefined ? source : invocationPath(file, cwd, root),
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
          verbatraCommand(["tmx", "import", source, ...tmxImportFlagArgs(opts)], opts),
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
      loadProject(
        deps,
        loadOptions(opts.config !== undefined ? { config: opts.config } : {}, cwd),
        context.ui,
      ),
    async ({ loaded, root }) => {
      const result = await withTask(context, "exporting the memory as TMX", () =>
        deps.exportTmx({
          config: loaded.config,
          cwd: root,
          ...configFilePaths(loaded),
          toolVersion: CLI_VERSION,
          ...(file !== undefined ? { out: invocationPath(file, cwd, root) } : {}),
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
    ...(opts.requireReviewed === true ? { requireReviewed: true } : {}),
    ...(opts.sensitive === true ? { sensitive: true } : {}),
  };
}

function checkFileInput(
  config: VerbatraConfig,
  cwd: string,
  file: string,
  opts: CheckOpts & { readonly qaSeverity?: QaSeverity },
): CheckFileInput {
  return {
    config,
    cwd,
    file,
    ...(opts.qaSeverity !== undefined ? { qaSeverity: opts.qaSeverity } : {}),
  };
}

async function runCheckFile(
  context: CommandContext,
  deps: CliDeps,
  config: VerbatraConfig,
  cwd: string,
  opts: CheckOpts & {
    readonly file: string;
    readonly path: string;
    readonly qaSeverity?: QaSeverity;
  },
): Promise<number> {
  const summary = await withTask(context, `checking ${opts.file}`, () =>
    deps.checkFile(checkFileInput(config, cwd, opts.path, opts)),
  );
  context.streams.out(
    context.json
      ? `${renderSuccessEnvelope("check", summary)}\n`
      : `${renderCheckFileHuman(summary)}\n`,
  );
  return checkFileExitCode(summary, opts.strict === true);
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
        async (config, root) => {
          if (opts.file !== undefined) {
            return runCheckFile(context, deps, config, root, {
              ...opts,
              file: opts.file,
              path: invocationPath(opts.file, cwd, root),
            });
          }
          const summary = await withTask(context, "checking the locales", () =>
            deps.check(checkInput(config, root, opts)),
          );
          context.streams.out(
            context.json
              ? `${renderSuccessEnvelope("check", summary)}\n`
              : `${renderCheckHuman(summary, isMachineTranslationEnabled(config))}\n`,
          );
          return checkExitCode(summary, opts.strict === true);
        },
      );
    },
  );
}

function everyPendingKeyProtected(summary: DiffSummary): boolean {
  const pending = summary.locales.flatMap((locale) => {
    const protectedKeys = new Set(locale.protected ?? []);
    return [...locale.missing, ...locale.changed].map((key) => protectedKeys.has(key));
  });
  return pending.length > 0 && pending.every((isProtected) => isProtected);
}

function pendingKeysHint(
  summary: DiffSummary,
  opts: LocationOpts,
  context: CommandContext,
  machineTranslation: boolean,
): void {
  if (!machineTranslation) {
    context.ui.hint(verbatraCommand(["export"], opts), HAND_OFF_PURPOSE);
    return;
  }
  if (everyPendingKeyProtected(summary)) {
    context.ui.hint(
      verbatraCommand(["studio"], opts),
      "every pending key is protected from machine writes, so review or edit it there",
    );
    return;
  }
  context.ui.hint(verbatraCommand(["translate"], opts), "send the pending keys to your provider");
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
      async (config, root) => {
        const label =
          opts.unused === true ? "diffing and scanning the source" : "diffing the locales";
        const summary = await withTask(context, label, (task) =>
          deps.diff({
            config,
            cwd: root,
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
          pendingKeysHint(summary, opts, context, isMachineTranslationEnabled(config));
        }
        return summary.hasPendingChanges || hasConfirmedUnusedKeys(summary) ? 1 : 0;
      },
    );
  });
}

function unreviewedMachineHint(
  report: ProvenanceReport,
  opts: LocationOpts,
  context: CommandContext,
): void {
  const unreviewed = report.locales.reduce(
    (sum, locale) => sum + locale.counts["machine-unreviewed"],
    0,
  );
  if (unreviewed > 0) {
    context.ui.hint(
      verbatraCommand(["studio"], opts),
      `approve or reject the ${unreviewed === 1 ? "machine translation" : `${unreviewed} machine translations`} no person has reviewed yet`,
    );
  }
}

async function runReport(
  rawOpts: unknown,
  deps: CliDeps,
  streams: Streams,
  settings?: TerminalSettings,
): Promise<number> {
  const context = commandContext("report", rawOpts, streams, settings);
  return withLocaleOpts(reportOptsSchema, rawOpts, context, async (opts) => {
    const cwd = opts.cwd ?? process.cwd();
    return withWholeRunErrors(
      deps,
      context,
      loadOptions(opts.config !== undefined ? { config: opts.config } : {}, cwd),
      async (config, root) => {
        const report = await withTask(context, "reading the provenance record", () =>
          deps.provenanceReport({
            config,
            cwd: root,
            toolVersion: CLI_VERSION,
            ...(opts.locales !== undefined ? { locales: opts.locales } : {}),
          }),
        );
        context.streams.out(
          context.json
            ? `${renderSuccessEnvelope("report", report)}\n`
            : `${renderProvenanceReportHuman(report)}\n`,
        );
        if (!report.available) {
          return 1;
        }
        unreviewedMachineHint(report, opts, context);
        return 0;
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
      return withWholeRunErrors(
        deps,
        context,
        loadOptions(opts.config !== undefined ? { config: opts.config } : {}, cwd),
        async (config, root) => {
          topUpGitignore(root, context);
          const result = await withTask(context, "pseudolocalizing the source", () =>
            deps.pseudolocalize({
              config,
              cwd: root,
              ...(opts.mode !== undefined ? { mode: opts.mode } : {}),
              ...(opts.locale !== undefined ? { locale: opts.locale } : {}),
              ...(opts.out !== undefined ? { out: invocationPath(opts.out, cwd, root) } : {}),
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
  { loaded, root }: LoadedProject,
  cwd: string,
  opts: z.infer<typeof typesOptsSchema>,
): GenerateTypesInput {
  return {
    config: loaded.config,
    cwd: root,
    ...configFilePaths(loaded),
    ...(opts.out !== undefined ? { out: invocationPath(opts.out, cwd, root) } : {}),
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
          loadProject(
            deps,
            loadOptions(opts.config !== undefined ? { config: opts.config } : {}, cwd),
            context.ui,
          ),
        async (project) => {
          const label =
            opts.check === true ? "checking the declarations" : "generating the declarations";
          const result = await withTask(context, label, () =>
            deps.generateTypes(typesInput(project, cwd, opts)),
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
  locales: z.boolean().optional(),
  live: z.boolean().optional(),
  dataFlow: z.boolean().optional(),
});

type DoctorOpts = z.infer<typeof doctorOptsSchema>;

function conflictingDataFlowFlag(opts: DoctorOpts): string | undefined {
  if (opts.dataFlow !== true) {
    return undefined;
  }
  const flags: readonly [boolean | undefined, string][] = [
    [opts.literals, "--literals"],
    [opts.locales, "--locales"],
    [opts.live, "--live"],
  ];
  return flags.find(([set]) => set === true)?.[1];
}

function parseDoctorOpts(rawOpts: unknown): DoctorOpts {
  const opts = doctorOptsSchema.parse(rawOpts);
  const conflict = conflictingDataFlowFlag(opts);
  if (conflict !== undefined) {
    throw new CliUsageError(
      "INVALID_OPTION",
      `--data-flow replaces the setup checks that ${conflict} reports on. Drop one of the two.`,
    );
  }
  if (opts.literals === true && (opts.locales === true || opts.live === true)) {
    throw new CliUsageError(
      "INVALID_OPTION",
      `${opts.live === true ? "--live" : "--locales"} reports on the setup checks, which --literals replaces. Drop one of the two.`,
    );
  }
  return opts;
}

const DOCTOR_STATUS_WORDS: Record<DoctorCheckStatus, StatusWord> = {
  pass: "ok",
  warn: "warn",
  fail: "fail",
  skipped: "skip",
};

function doctorTaskLabel(opts: DoctorOpts): string {
  if (opts.literals === true) {
    return "scanning the source for literals";
  }
  if (opts.dataFlow === true) {
    return "describing the data flow";
  }
  return opts.live === true
    ? "checking the setup and fetching the provider's language list"
    : "checking the setup";
}

async function runDoctor(
  rawOpts: unknown,
  deps: CliDeps,
  streams: Streams,
  settings?: TerminalSettings,
): Promise<number> {
  const context = commandContext("doctor", rawOpts, streams, settings);
  return withParsedOpts(
    () => parseDoctorOpts(rawOpts),
    context,
    async (opts) => {
      const cwd = opts.cwd ?? process.cwd();
      const literals = opts.literals === true;
      try {
        if (!literals) {
          loadEnvFiles(cwd, opts.config);
        }
        const result = await withTask(context, doctorTaskLabel(opts), (task) =>
          deps.doctor({
            cwd,
            ...(opts.config !== undefined ? { configPath: opts.config } : {}),
            ...(literals ? { literals: true, onProgress: scanProgressReporter(task) } : {}),
            ...(opts.live === true ? { live: true } : {}),
            ...(opts.dataFlow === true ? { dataFlow: true } : {}),
          }),
        );
        const showLocales = opts.locales === true || opts.live === true;
        context.streams.out(
          context.json
            ? `${renderSuccessEnvelope("doctor", result)}\n`
            : `${renderDoctorHuman(result, {
                locales: showLocales,
                paintStatus: (status, label) =>
                  context.ui.outStatus(DOCTOR_STATUS_WORDS[status], label),
              })}\n`,
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
    .option("--cwd <path>", "search for the config from this directory")
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
      ctx.hooks.onLockingCommand?.({ json: jsonFlagSchema.safeParse(opts).data?.json === true });
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
    .option("--cwd <path>", "search for the config from this directory")
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
    })
    .addHelpText(
      "after",
      [
        "",
        "Examples:",
        "  $ verbatra watch                     translate now, then again after every source change",
        "  $ verbatra watch --locales de        keep only German current while you work",
        "  $ verbatra watch --debounce 1000     wait 1s after the last change before translating",
        "  $ verbatra watch --json              one NDJSON record per run on stdout",
        "",
        "Press Ctrl-C once to finish the current run and stop; press it again to stop at once.",
      ].join("\n"),
    );
}

function registerExportCommand(program: Command, ctx: ProgramContext): void {
  program
    .command("export")
    .description(
      "Export untranslated strings into a translator handoff (Excel workbook, CSV, TSV, or XLIFF)",
    )
    .option("--cwd <path>", "search for the config from this directory")
    .option("--config <path>", "load this config file instead of searching for one")
    .option(
      "--out <path>",
      "write the handoff here: a file for xlsx (default verbatra-translations.xlsx), a directory for csv, tsv, xliff2 and xliff12 (default verbatra-translations)",
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
        "  $ verbatra export --format xliff2       write one <locale>.xlf per locale for a CAT tool",
      ].join("\n"),
    );
}

function registerImportCommand(program: Command, ctx: ProgramContext): void {
  program
    .command("import")
    .argument(
      "<workbook>",
      "path to the filled handoff: a workbook file, one csv, tsv or xlf file, or a directory of them",
    )
    .description(
      "Import a filled handoff back into the locale files, running the same safety checks",
    )
    .option("--cwd <path>", "search for the config from this directory")
    .option("--config <path>", "load this config file instead of searching for one")
    .option("--dry-run", "validate and report without writing locale files or updating the lock")
    .option("--format <format>", IMPORT_FORMAT_OPTION_DESCRIPTION)
    .option(
      "--reviewer <name>",
      "name recorded on each XLIFF unit the handoff marks reviewed or final (stored in the committed provenance file)",
    )
    .option(
      "--lock-timeout <seconds>",
      "how long to wait for a held per-locale write lock before failing (default 600)",
    )
    .option("--json", "print the run summary as JSON")
    .action(async (workbook: string, opts: unknown) => {
      ctx.hooks.onLockingCommand?.({ json: jsonFlagSchema.safeParse(opts).data?.json === true });
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
        "  $ verbatra import handoff/de.xlf --reviewer Ana  import an XLIFF file back from a CAT tool",
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
    .option("--cwd <path>", "search for the config from this directory")
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
    .option("--cwd <path>", "search for the config from this directory")
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
    .option(
      "--file <path>",
      "check only this locale file: its syntax, then its values against the source (fast, for edit hooks)",
    )
    .option("--severity <level>", "lowest quality-check severity to report: error or warning")
    .option(
      "--strict",
      "with --qa or --file, also exit 1 on quality-check warnings and missing plural categories",
    )
    .option(
      "--require-reviewed",
      "also exit 1 while a machine-written translation is not approved (reads the committed review state)",
    )
    .option(
      "--sensitive",
      "also scan the source file and glossary for content that looks sensitive (exit 1 on any finding)",
    )
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
        "  $ verbatra check --qa --strict    also fail on warnings and missing plural categories",
        "  $ verbatra check --require-reviewed  fail while machine translations wait for approval",
        "  $ verbatra check --sensitive      fail on emails, keys or card numbers about to be sent",
        "  $ verbatra check --file locales/de.json --json  check one edited file, nothing else",
      ].join("\n"),
    );
}

function registerDiffCommand(program: Command, ctx: ProgramContext): void {
  program
    .command("diff")
    .description(
      "Show the keys that would be added, re-translated, or orphaned per locale without writing files",
    )
    .option("--cwd <path>", "search for the config from this directory")
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

function registerReportCommand(program: Command, ctx: ProgramContext): void {
  program
    .command("report")
    .addArgument(new Argument("<report>", "which report to print").choices([...REPORT_KINDS]))
    .description(
      "Print a read-only project report: provenance lists where each translation came from and whether a person reviewed it",
    )
    .option("--cwd <path>", "search for the config from this directory")
    .option("--config <path>", "load this config file instead of searching for one")
    .option("--locales <list>", "comma-separated subset of target locales (default all configured)")
    .option("--json", "print the report as JSON, with every key's origin and review state")
    .action(async (_report: string, opts: unknown) => {
      ctx.setCode(await runReport(opts, ctx.deps, ctx.streams, ctx.settings()));
    })
    .addHelpText(
      "after",
      [
        "",
        "Examples:",
        "  $ verbatra report provenance                   counts per locale: machine, reviewed, human, imported",
        "  $ verbatra report provenance --json > audit.json  every key's origin and review state, for an audit file",
        "  $ verbatra report provenance --locales de      only the German locale",
      ].join("\n"),
    );
}

function registerPseudoCommand(program: Command, ctx: ProgramContext): void {
  program
    .command("pseudo")
    .description("Generate a pseudolocale from the source strings without calling a provider")
    .option("--cwd <path>", "search for the config from this directory")
    .option("--config <path>", "load this config file instead of searching for one")
    .option(
      "--mode <mode>",
      `transform to apply: ${PSEUDO_MODES.join(" or ")} (default accented); bidi renders right to left`,
    )
    .option(
      "--locale <code>",
      "pseudolocale code to generate (default en-XA, or ar-XB with --mode bidi)",
    )
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
        "  $ verbatra pseudo --mode bidi         generate ar-XB, rendered right to left",
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
    .option("--cwd <path>", "search for the config from this directory")
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
    .option("--cwd <path>", "search for the config from this directory")
    .option("--config <path>", "load this config file instead of searching for one")
    .option(
      "--literals",
      "scan the extract source roots for hardcoded user-facing strings instead of checking the setup",
    )
    .option(
      "--locales",
      "list per target locale what the provider supports: code sent, support, glossary, formality",
    )
    .option(
      "--live",
      "fetch the provider's current language list first (needs its key; uses no translation quota); implies --locales",
    )
    .option(
      "--data-flow",
      "describe what is sent to which host and what is written locally, instead of checking the setup",
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
        "  $ verbatra doctor --locales   what the provider supports for each target locale",
        "  $ verbatra doctor --live      the same, against the provider's current language list",
        "  $ verbatra doctor --data-flow --json  a data-flow manifest to attach to a DPA review",
        "",
        "With --literals it reads your source and never writes it, constructs no provider, and " +
          "reads no API key, so it runs before any key exists.",
        "With --data-flow it reads no API key and makes no network request.",
      ].join("\n"),
    );
}

function registerStudioCommand(program: Command, ctx: ProgramContext): void {
  program
    .command("studio")
    .description("Start Verbatra Studio, the local translation dashboard")
    .option("--cwd <path>", "search for the config from this directory")
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
    .option("--cwd <path>", "search for the config from this directory")
    .option("--config <path>", "load this config file instead of searching for one")
    .option(
      "--allow-spend",
      "advertise the tools that call a translation provider (also: VERBATRA_MCP_ALLOW_SPEND)",
    )
    .option(
      "--redact-values",
      "replace translation values in every tool result with a marker (also: VERBATRA_MCP_REDACT_VALUES)",
    )
    .configureOutput({ outputError: discardCommanderError })
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
        "  $ verbatra mcp --redact-values  keep translation values out of every tool result",
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
        "openai-compatible, libretranslate, or none to disable machine translation (required " +
        "unless prompted)",
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
      "locale file pattern containing the {locale} token (default: detected, else the format's default layout)",
    )
    .option("--model <name>", "model to use (required for openai-compatible)")
    .option(
      "--base-url <url>",
      "server URL for openai-compatible or libretranslate (required for both)",
    )
    .option(
      "--api-key-env-var <name>",
      "environment variable openai-compatible reads its key from (never the key itself)",
    )
    .option("--yes", "skip prompts and accept the defaults for anything not passed or detected")
    .option("--force", "overwrite an existing verbatra.config.ts that differs")
    .option("--json", "print one JSON document describing what was written; never prompts")
    .option(
      "--agent",
      `also write verbatra rules for coding agents to AGENTS.md (or CLAUDE.md) and the verbatra MCP server, spending off, to each detected client's project config (${AGENT_CLIENT_IDS.map((id) => AGENT_CLIENT_CONFIGS[id].file).join(", ")}; .mcp.json when none is detected)`,
    )
    .option(
      "--client <ids>",
      `comma-separated clients --agent wires instead of the detected ones: ${CLIENT_FLAG_VALUES.join(", ")}`,
    )
    .option("--dry-run", "report every file init would write or change, and write nothing")
    .action(async (opts: InitOpts) => {
      ctx.setCode(await runInit(opts, ctx.streams, {}, ctx.settings()));
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
        "  $ verbatra init --provider libretranslate --base-url http://localhost:5000 --yes",
        "  $ verbatra init --provider none --yes       human-only: no provider, no API key",
        "  $ verbatra init --provider gemini --yes --agent   also set up AGENTS.md and .mcp.json for coding agents",
        "  $ verbatra init --agent                     already configured: keep the config, add only the agent files",
        "  $ verbatra init --agent --client cursor,vscode   wire Cursor and VS Code instead of the detected clients",
        "  $ verbatra init --agent --client all --dry-run   show what would be written, write nothing",
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
        async (config, root) => {
          const result = await withTask(context, "scanning the source", (task) =>
            deps.extract({
              config,
              cwd: root,
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
    .option("--cwd <path>", "search for the config from this directory")
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

const cwdOptionSchema = z.object({ cwd: z.string().optional() });

function assertCwdOption(rawOpts: unknown, deps: CliDeps): void {
  const parsed = cwdOptionSchema.safeParse(rawOpts);
  if (parsed.success && parsed.data.cwd !== undefined) {
    assertCwdDirectory(parsed.data.cwd, deps.isDirectory);
  }
}

function terminalSettings(program: Command, facts: TerminalFacts): TerminalSettings {
  const global = globalOptsSchema.parse(program.opts());
  return { facts, quiet: global.quiet === true, color: global.color !== false };
}

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
    .option(
      "-q, --quiet",
      "print only results, warnings and errors: no progress, hints or informational lines",
    )
    .option("--no-color", "never color the output (also: NO_COLOR, VERBATRA_NO_COLOR)")
    .exitOverride()
    .configureOutput({ writeOut: (s) => streams.out(s), writeErr: (s) => streams.err(s) })
    .hook("preAction", (_program, actionCommand) => assertCwdOption(actionCommand.opts(), deps));

  const settings = (): TerminalSettings => terminalSettings(program, facts);
  const ctx: ProgramContext = { deps, streams, hooks, setCode, settings };
  registerTranslateCommand(program, ctx);
  registerWatchCommand(program, ctx);
  registerExportCommand(program, ctx);
  registerImportCommand(program, ctx);
  registerTmxCommand(program, ctx);
  registerCheckCommand(program, ctx);
  registerDiffCommand(program, ctx);
  registerReportCommand(program, ctx);
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
      "\nverbatra: no config found in this directory or any parent directory the search covers. Run verbatra init to set up this project.\n",
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
      return renderUsageFailureExit2(error, program, argv, streams, facts);
    }
    if (error instanceof CliUsageError) {
      const command = resolveCommandName(program, argv);
      const json = { json: argvRequestsJson(argv) };
      const settings = terminalSettings(program, facts);
      return renderFailureExit2(error, commandContext(command, json, streams, settings));
    }
    throw error;
  }
  return code;
}
