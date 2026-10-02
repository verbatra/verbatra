import { relative, resolve } from "node:path";
import type { LocaleResource } from "@verbatra/core";
import {
  AdapterError,
  type AdapterErrorCode,
  type AdapterRegistry,
  type FormatAdapter,
  type ReadResult,
} from "@verbatra/format-adapters";
import type { VerbatraConfig } from "../config/schema.js";
import { SdkError } from "../errors.js";
import { defaultFs, type SdkFs } from "../fs.js";
import { createLocalePathResolver, type LocalePathResolver } from "../locale-path/resolver.js";
import { isSharedCatalogueFormat } from "../locale-path/shared-catalogue-format.js";
import { projectRelativeMessage } from "../project-relative.js";
import { selectAdapter } from "../selection/select-adapter.js";
import { findIncompletePlurals, type IncompletePlural } from "./plural-completeness.js";
import {
  type CheckQaSummary,
  createQaContext,
  type QaContext,
  type QaFinding,
  type QaSeverity,
  qaLocale,
  totalQa,
} from "./qa-check.js";
import { readSourceResource } from "./source.js";

/**
 * A locale file that could not be parsed at all, reported by {@link checkFile} as a finding
 * rather than thrown: malformed syntax, a parseable file of the wrong shape, or a file over a read
 * limit. No value in such a file can be checked, so it is the only finding its locale carries.
 */
export interface QaSyntaxFinding {
  /** Always `error`: verbatra cannot read the file as it stands. */
  readonly severity: "error";
  /** Always `syntax`, which tells this finding apart from a per-key {@link QaFinding}. */
  readonly reason: "syntax";
  /**
   * The format adapter's code: `INVALID_JSON`, `INVALID_YAML` or `INVALID_XML` for malformed
   * syntax, `INVALID_STRUCTURE` or `MIXED_STRUCTURE` for a file of the wrong shape,
   * `MAX_DEPTH_EXCEEDED` or `INPUT_TOO_LARGE` for a read limit, `ADAPTER_FAILED` for a `custom:`
   * adapter that threw.
   */
  readonly code: AdapterErrorCode;
  /** The adapter's description of what is wrong, with paths made relative to the working directory. */
  readonly message: string;
  /** The line of the malformed syntax, counted from 1, when the parser located it. */
  readonly line?: number;
  /** The column of the malformed syntax within {@link QaSyntaxFinding.line}, counted from 1. */
  readonly column?: number;
}

/** One finding of {@link checkFile}: a per-key quality-check finding or a syntax finding. */
export type CheckFileFinding = QaFinding | QaSyntaxFinding;

/**
 * One locale's result in a {@link CheckFileSummary}, the same shape as a {@link LocaleQaReport}
 * with {@link QaSyntaxFinding} added to the findings a report can hold.
 */
export interface FileQaReport {
  /** How many committed values were checked, counted as {@link LocaleQaReport.checked} counts them. */
  readonly checked: number;
  /** How many findings have severity `error`, a syntax finding included. */
  readonly errors: number;
  /** How many findings have severity `warning`. */
  readonly warnings: number;
  /**
   * Every finding. A file that could not be parsed holds exactly one {@link QaSyntaxFinding};
   * otherwise the per-key findings, ordered by key.
   */
  readonly findings: readonly CheckFileFinding[];
}

/** One locale checked by {@link checkFile}. */
export interface LocaleFileCheck {
  /** The locale these results describe. */
  readonly locale: string;
  /**
   * Every plural whose forms in this locale lack CLDR plural categories the language uses, as
   * {@link LocaleCheckSummary.incompletePlurals} reports them. A warning that never counts toward
   * `errors` or `warnings`. Always empty for the source locale and for a file that could not be
   * parsed.
   */
  readonly incompletePlurals: readonly IncompletePlural[];
  /** The quality check of the locale's committed values, plus a syntax finding when it applies. */
  readonly qa: FileQaReport;
}

/**
 * What the checked file is to the project. `source`: the source locale file, checked for syntax
 * alone. `target`: a target locale file, checked for syntax and then against the source.
 * `catalogue`: the single file of a format that holds every locale (such as `apple-xcstrings`),
 * checked for syntax and then for every target locale.
 */
export type CheckFileRole = "source" | "target" | "catalogue";

/** The result of {@link checkFile}. */
export interface CheckFileSummary {
  /** The checked file, relative to the working directory. */
  readonly file: string;
  /** What the file is to the project. */
  readonly role: CheckFileRole;
  /**
   * One entry for a source or target file, holding that file's locale. For a catalogue, one entry
   * per target locale, or a single source-locale entry holding the syntax finding when the
   * catalogue could not be parsed.
   */
  readonly locales: readonly LocaleFileCheck[];
  /**
   * The totals across {@link CheckFileSummary.locales}, the same shape as {@link CheckSummary.qa}.
   * `invalidSourceKeys` is read from the source locale file, which a target check reads anyway.
   * A caller that gates on the check fails when `errors` is above zero.
   */
  readonly qa: CheckQaSummary;
}

/** Input for {@link checkFile}. */
export interface CheckFileInput {
  /** The resolved project config, normally from {@link loadConfig}. */
  readonly config: VerbatraConfig;
  /**
   * Directory the `files.pattern` and {@link CheckFileInput.file} are resolved against. Defaults
   * to the process working directory.
   */
  readonly cwd?: string;
  /** The locale file to check, absolute or relative to the working directory. */
  readonly file: string;
  /**
   * The lowest severity to report. `error` skips the review reasons, so only syntax and integrity
   * failures are reported. Defaults to `warning`.
   */
  readonly qaSeverity?: QaSeverity;
}

/** Injectable dependencies for {@link checkFile}. Every field has a working default. */
export interface CheckFileDeps {
  /** Format-adapter registry to resolve the configured format. Defaults to the built-in registry. */
  readonly adapterRegistry?: AdapterRegistry;
  /** File-system port. Defaults to the real file system. */
  readonly fs?: SdkFs;
}

interface FileCheckContext {
  readonly config: VerbatraConfig;
  readonly cwd: string;
  readonly path: string;
  readonly adapter: FormatAdapter;
  readonly resolver: LocalePathResolver;
  readonly fs: SdkFs;
  readonly severity: QaSeverity;
}

type FileRead =
  | { readonly kind: "read"; readonly result: ReadResult }
  | { readonly kind: "syntax"; readonly finding: QaSyntaxFinding };

function notALocaleFile(context: FileCheckContext, reason: string): SdkError {
  return new SdkError(
    "NOT_A_LOCALE_FILE",
    `${relative(context.cwd, context.path)} is not a locale file of this project: ${reason}.`,
  );
}

interface NamedFile {
  readonly role: CheckFileRole;
  readonly locale: string;
}

function namedFileOf(context: FileCheckContext): NamedFile {
  const { config, resolver, path } = context;
  if (isSharedCatalogueFormat(config.format)) {
    if (resolver.pathFor(config.sourceLocale) === path) {
      return { role: "catalogue", locale: config.sourceLocale };
    }
    throw notALocaleFile(context, `the ${config.format} catalogue is ${config.files.pattern}`);
  }
  const locale = resolver.localeFor(path);
  if (locale === undefined) {
    throw notALocaleFile(
      context,
      `it is not the file of any configured locale under ${config.files.pattern}`,
    );
  }
  return { role: locale === config.sourceLocale ? "source" : "target", locale };
}

function syntaxFinding(error: AdapterError, cwd: string): QaSyntaxFinding {
  const message = projectRelativeMessage(error.message, cwd);
  const base = { severity: "error", reason: "syntax", code: error.code, message } as const;
  return error.position === undefined
    ? base
    : { ...base, line: error.position.line, column: error.position.column };
}

async function readNamedFile(context: FileCheckContext, locale: string): Promise<FileRead> {
  try {
    return { kind: "read", result: await context.adapter.read(context.path, locale) };
  } catch (error) {
    if (error instanceof AdapterError) {
      return { kind: "syntax", finding: syntaxFinding(error, context.cwd) };
    }
    throw error;
  }
}

function syntaxOnly(locale: string, finding: QaSyntaxFinding | undefined): LocaleFileCheck {
  const findings = finding === undefined ? [] : [finding];
  return {
    locale,
    incompletePlurals: [],
    qa: { checked: 0, errors: findings.length, warnings: 0, findings },
  };
}

function checkAgainstSource(
  context: FileCheckContext,
  qa: QaContext,
  source: LocaleResource,
  target: LocaleResource,
): LocaleFileCheck {
  const locale = target.locale;
  return {
    locale,
    incompletePlurals: findIncompletePlurals(context.config.format, source, target, locale),
    qa: qaLocale(qa, locale, source, target),
  };
}

function summary(
  context: FileCheckContext,
  role: CheckFileRole,
  locales: readonly LocaleFileCheck[],
  invalidSourceKeys: readonly string[],
): CheckFileSummary {
  return {
    file: relative(context.cwd, context.path),
    role,
    locales,
    qa: totalQa(
      locales.map((entry) => entry.qa),
      invalidSourceKeys,
    ),
  };
}

function qaContextFor(context: FileCheckContext, invalidSourceKeys: readonly string[]): QaContext {
  return createQaContext(context.config, context.adapter, context.severity, invalidSourceKeys);
}

async function checkSourceFile(
  context: FileCheckContext,
  sourceLocale: string,
): Promise<CheckFileSummary> {
  const read = await readNamedFile(context, sourceLocale);
  if (read.kind === "syntax") {
    return summary(context, "source", [syntaxOnly(sourceLocale, read.finding)], []);
  }
  return summary(
    context,
    "source",
    [syntaxOnly(sourceLocale, undefined)],
    read.result.invalidIcuKeys,
  );
}

async function checkTargetFile(
  context: FileCheckContext,
  locale: string,
): Promise<CheckFileSummary> {
  const read = await readNamedFile(context, locale);
  if (read.kind === "syntax") {
    return summary(context, "target", [syntaxOnly(locale, read.finding)], []);
  }
  const { config, resolver, fs, adapter } = context;
  const source = await readSourceResource(config, resolver, fs, adapter);
  const qa = qaContextFor(context, source.invalidIcuKeys);
  const checked = checkAgainstSource(context, qa, source.resource, read.result.resource);
  return summary(context, "target", [checked], source.invalidIcuKeys);
}

async function checkCatalogue(
  context: FileCheckContext,
  sourceLocale: string,
): Promise<CheckFileSummary> {
  const read = await readNamedFile(context, sourceLocale);
  if (read.kind === "syntax") {
    return summary(context, "catalogue", [syntaxOnly(sourceLocale, read.finding)], []);
  }
  const source = read.result;
  const qa = qaContextFor(context, source.invalidIcuKeys);
  const locales: LocaleFileCheck[] = [];
  for (const locale of context.config.targetLocales) {
    const target = (await context.adapter.read(context.path, locale)).resource;
    locales.push(checkAgainstSource(context, qa, source.resource, target));
  }
  return summary(context, "catalogue", locales, source.invalidIcuKeys);
}

const CHECKS_BY_ROLE: Readonly<
  Record<CheckFileRole, (context: FileCheckContext, locale: string) => Promise<CheckFileSummary>>
> = {
  source: checkSourceFile,
  target: checkTargetFile,
  catalogue: checkCatalogue,
};

/**
 * Checks one locale file, the fast path for validating a file right after it was edited by hand
 * or by an agent. It reads that file and, for a target locale, the source locale file, and
 * nothing else: no other locale, no lock-file, no provenance file, no source code, and no
 * provider. It writes nothing and needs no API key.
 *
 * The file is resolved against the config's `files.pattern` and `files.localeStyle` to the locale
 * it holds. A file that cannot be parsed is reported as a {@link QaSyntaxFinding}, with the line
 * and column when the parser located them, rather than thrown. A target locale file that parses is
 * then checked against the source the way {@link check} with `qa` checks every locale: the
 * write-time integrity gate as errors (placeholders, inline markup, ICU) and the review reasons as
 * warnings, plus the plurals that lack CLDR categories. The source locale file is checked for
 * syntax alone, since there is nothing to hold it against; its keys whose value is not a valid ICU
 * message are listed in `qa.invalidSourceKeys`.
 *
 * @param input - The config, the file, and the optional severity floor.
 * @param deps - Optional adapter registry and file-system overrides.
 * @returns The file's role, one locale result (one per target locale for a catalogue), and totals.
 *
 * @throws {@link SdkError} `NOT_A_LOCALE_FILE`: the path is not the file of any configured locale,
 * or no file exists there.
 * @throws {@link SdkError} `UNKNOWN_FORMAT`: no adapter is registered for the configured format.
 * @throws {@link SdkError} `LOCALE_LAYOUT_INVALID`: the `files.pattern` and `files.localeStyle`
 * cannot be combined, or a configured locale has no valid path spelling under that style.
 * @throws {@link SdkError} `LOCALE_PATH_COLLISION`: two configured locales resolve to the same path.
 * @throws {@link SdkError} `SOURCE_UNREADABLE`: a target file was checked and the source locale
 * file does not exist.
 * @throws {@link SdkError} `SOURCE_INVALID`: a target file was checked and the source locale file
 * could not be parsed.
 */
export async function checkFile(
  input: CheckFileInput,
  deps: CheckFileDeps = {},
): Promise<CheckFileSummary> {
  const cwd = input.cwd ?? process.cwd();
  const fs = deps.fs ?? defaultFs;
  const context: FileCheckContext = {
    config: input.config,
    cwd,
    path: resolve(cwd, input.file),
    adapter: selectAdapter(input.config.format, deps.adapterRegistry, deps.fs),
    resolver: createLocalePathResolver(cwd, input.config),
    fs,
    severity: input.qaSeverity ?? "warning",
  };
  const named = namedFileOf(context);
  if (!(await fs.fileExists(context.path))) {
    throw notALocaleFile(context, "no file exists at that path");
  }
  return CHECKS_BY_ROLE[named.role](context, named.locale);
}
