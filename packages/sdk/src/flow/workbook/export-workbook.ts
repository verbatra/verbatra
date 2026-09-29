import { dirname, join, relative, resolve, sep } from "node:path";
import { computeReviewFlags, type LocaleGlossary, type ReviewFlag } from "@verbatra/ai-providers";
import { checkPlaceholders, contentHash, diffResources, type LocaleResource } from "@verbatra/core";
import {
  buildDelimited,
  buildWorkbook,
  buildXliff,
  type ReviewStatus,
  type WorkbookModel,
  type WorkbookRow,
  type WorkbookSheet,
} from "@verbatra/exchange";
import type { AdapterRegistry, FormatAdapter } from "@verbatra/format-adapters";
import { glossaryForLocale } from "../../config/glossary.js";
import { toMaxLengthMap } from "../../config/max-length.js";
import type { VerbatraConfig } from "../../config/schema.js";
import { SdkError } from "../../errors.js";
import { defaultFs, type SdkFs } from "../../fs.js";
import { createLocalePathResolver } from "../../locale-path/resolver.js";
import type { LocaleProvenance } from "../../lock/key-provenance.js";
import { baselineFor } from "../../lock/lock-file.js";
import { selectAdapter } from "../../selection/select-adapter.js";
import { branchArmProblems } from "../integrity-gate.js";
import { readCarriedOverLock, readCarriedOverProvenance } from "../locale-carry-over.js";
import { readTargetResource } from "../read-target.js";
import {
  createOutputPathGuard,
  namesNoFile,
  type OutputPathGuard,
  type OutputPathRefusal,
  outputRefusalReason,
  type ReservedPath,
  reservedProjectPaths,
} from "../reserved-output.js";
import { selectLocales } from "../select-locales.js";
import { readSourceResource } from "../source.js";
import { unwritableFileMessage } from "../write-target.js";
import { xliffUnits } from "../xliff/xliff-units.js";
import {
  DEFAULT_EXCHANGE_FORMAT,
  type DirectoryFormat,
  type ExchangeFormat,
  handoffFamily,
  handoffFileName,
  isDirectoryFormat,
  isXliffFormat,
  xliffVersionOf,
} from "./exchange-format.js";
import { exportManifestFileName, writeExportManifest } from "./export-manifest.js";

/** Default output path for an `.xlsx` handoff, used when {@link ExportWorkbookInput.out} is omitted. */
export const DEFAULT_WORKBOOK_PATH = "verbatra-translations.xlsx";

/**
 * Default output directory for a delimited or XLIFF handoff. It carries no extension because it
 * names a directory, not a file: the export creates it and writes one file inside it per exported
 * locale, such as `de.csv` for `csv` or `de.xlf` for `xliff2` and `xliff12`.
 */
export const DEFAULT_DELIMITED_PATH = "verbatra-translations";

/** Input for {@link exportWorkbook}. */
export interface ExportWorkbookInput {
  /** The resolved project config, normally from {@link loadConfig}. */
  readonly config: VerbatraConfig;
  /** Directory the `files.pattern` and `out` are resolved against. Defaults to the process working directory. */
  readonly cwd?: string;
  /**
   * Where to write the handoff. Defaults to {@link DEFAULT_WORKBOOK_PATH} for `xlsx` and to
   * {@link DEFAULT_DELIMITED_PATH} for the delimited and XLIFF formats. Refused with `EXPORT_OUTPUT_CONFLICT`,
   * before anything is read or written, when it resolves outside `cwd`, or when it or a file the
   * export would write names a configured locale file, the lock file, the provenance file, the
   * translation-memory cache, a file verbatra searches for its configuration, the
   * {@link ExportWorkbookInput.configPath} file, or the {@link ExportWorkbookInput.glossaryPath}
   * file. For `xlsx` it is also refused when it names no file (including one ending in a path
   * separator) or names `cwd` itself; a delimited or XLIFF export may write into `cwd`. Names are compared
   * case-insensitively, and, when the file-system port implements `realpath`, again after symbolic
   * links are resolved, so a link cannot carry the handoff anywhere a plain path could not.
   */
  readonly out?: string;
  /**
   * The configuration file `config` was loaded from, absolute or relative to `cwd`. It is refused
   * as the output path even when its name is not one verbatra searches for.
   */
  readonly configPath?: string;
  /**
   * The glossary file the config names, absolute or relative to `cwd`, normally the `path` of a
   * file-backed {@link LoadedConfig.glossary}. It is refused as the output path.
   */
  readonly glossaryPath?: string;
  /** Restrict the export to these target locales. Defaults to every configured target locale. */
  readonly locales?: readonly string[];
  /**
   * Include keys that are already up to date, not just the missing and stale ones. Useful when a
   * translator needs the surrounding context to translate consistently. Defaults to false.
   */
  readonly includeUnchanged?: boolean;
  /** The handoff shape to write. Defaults to `xlsx`. */
  readonly format?: ExchangeFormat;
}

/** Injectable dependencies for {@link exportWorkbook}. Every field has a working default. */
export interface ExportWorkbookDeps {
  /** Format-adapter registry to resolve the configured format. Defaults to the built-in registry. */
  readonly adapterRegistry?: AdapterRegistry;
  /** File-system port. Defaults to the real file system. */
  readonly fs?: SdkFs;
}

/** What {@link exportWorkbook} wrote. */
export interface ExportWorkbookResult {
  /**
   * The absolute path written: the workbook file for `xlsx`, or the directory the per-locale files
   * were written into for a delimited or XLIFF format.
   */
  readonly path: string;
  /** Row counts per exported locale. */
  readonly locales: readonly {
    /** The exported target locale. */
    readonly locale: string;
    /** How many translatable rows that locale contributed. */
    readonly rows: number;
  }[];
}

function reasonLabel(reason: string): string {
  return reason.toLowerCase().replace(/_/g, "-");
}

function armLabel(armProblems: readonly string[]): readonly string[] {
  return armProblems.length === 0 ? [] : [`icu-arms: ${armProblems.join("; ")}`];
}

function reviewColumns(
  flag: ReviewFlag | undefined,
  armProblems: readonly string[],
): { reviewStatus: ReviewStatus; reviewReasons: string } {
  const labels = [...(flag?.reasons ?? []).map(reasonLabel), ...armLabel(armProblems)];
  return labels.length === 0
    ? { reviewStatus: "ok", reviewReasons: "" }
    : { reviewStatus: "review", reviewReasons: labels.join(", ") };
}

function computeRowReview(
  adapter: FormatAdapter,
  sourceValue: string,
  currentTarget: string,
  sourceLocale: string,
  targetLocale: string,
  glossary: LocaleGlossary | undefined,
  maxLength: number | undefined,
): { reviewStatus: ReviewStatus; reviewReasons: string } {
  if (currentTarget === "") {
    return { reviewStatus: "ok", reviewReasons: "" };
  }
  const integrity =
    adapter.comparePlaceholders?.(sourceValue, currentTarget) ??
    checkPlaceholders(
      adapter.extractPlaceholders(sourceValue),
      adapter.extractPlaceholders(currentTarget),
    );
  const flag = computeReviewFlags({
    sourceValue,
    translatedValue: currentTarget,
    sourceLocale,
    targetLocale,
    integrity,
    glossary,
    maxLength,
  });
  return reviewColumns(flag, branchArmProblems(sourceValue, currentTarget, adapter, targetLocale));
}

function buildRows(
  source: LocaleResource,
  target: LocaleResource,
  baseline: ReadonlyMap<string, string>,
  includeUnchanged: boolean,
  adapter: FormatAdapter,
  glossary: LocaleGlossary | undefined,
  maxLength: ReadonlyMap<string, number> | undefined,
): readonly WorkbookRow[] {
  const diff = diffResources(source, target, { baseline });
  const rows: WorkbookRow[] = [];
  const add = (keys: readonly string[], status: "new" | "changed" | "unchanged"): void => {
    for (const key of keys) {
      const sourceEntry = source.entries.get(key);
      if (sourceEntry === undefined) {
        continue;
      }
      const currentTarget = target.entries.get(key)?.value ?? "";
      rows.push({
        key,
        source: sourceEntry.value,
        currentTarget,
        status,
        sourceHash: contentHash(sourceEntry),
        translation: "",
        context: sourceEntry.description ?? "",
        ...computeRowReview(
          adapter,
          sourceEntry.value,
          currentTarget,
          source.locale,
          target.locale,
          glossary,
          maxLength?.get(key),
        ),
      });
    }
  };
  add(diff.missing, "new");
  add(diff.changed, "changed");
  if (includeUnchanged) {
    add(diff.unchanged, "unchanged");
  }
  return [...rows].sort((a, b) => (a.key < b.key ? -1 : 1));
}

function outputHint(delimited: boolean): string {
  return delimited
    ? `Pass a directory inside the working directory, or omit it to use ${DEFAULT_DELIMITED_PATH}.`
    : `Pass a path naming a file inside the working directory, or omit it to use ${DEFAULT_WORKBOOK_PATH}.`;
}

function refuseOutput(requested: string, why: string, delimited: boolean): never {
  throw new SdkError(
    "EXPORT_OUTPUT_CONFLICT",
    `The output path "${requested}" ${why} ${outputHint(delimited)}`,
  );
}

function displayName(path: string, cwd: string): string {
  return relative(cwd, path).split(sep).join("/");
}

interface OutputGuard {
  readonly cwd: string;
  readonly paths: OutputPathGuard;
}

async function resolveWorkbookPath(guard: OutputGuard, requested: string): Promise<string> {
  if (namesNoFile(requested)) {
    refuseOutput(requested, "names no file.", false);
  }
  const outputPath = resolve(guard.cwd, requested);
  const refusal = await guard.paths.refusal(outputPath);
  if (refusal !== undefined) {
    refuseOutput(requested, outputRefusalReason(refusal), false);
  }
  return outputPath;
}

function directoryRefusal(refusal: OutputPathRefusal | undefined): OutputPathRefusal | undefined {
  return refusal?.kind === "working-directory" ? undefined : refusal;
}

async function resolveDelimitedDirectory(
  guard: OutputGuard,
  requested: string,
  fileNames: readonly string[],
): Promise<string> {
  if (requested.trim() === "") {
    refuseOutput(requested, "names no directory.", true);
  }
  const directory = resolve(guard.cwd, requested);
  const refusal = directoryRefusal(await guard.paths.refusal(directory));
  if (refusal !== undefined) {
    refuseOutput(requested, outputRefusalReason(refusal), true);
  }
  for (const fileName of fileNames) {
    const filePath = join(directory, fileName);
    const fileRefusal = await guard.paths.refusal(filePath);
    if (fileRefusal !== undefined) {
      refuseOutput(
        requested,
        `would write ${displayName(filePath, guard.cwd)}, which ${outputRefusalReason(fileRefusal)}`,
        true,
      );
    }
  }
  return directory;
}

async function writeHandoff(
  what: string,
  path: string,
  cwd: string,
  write: () => Promise<void>,
): Promise<void> {
  try {
    await write();
  } catch (error) {
    throw new SdkError("EXPORT_UNWRITABLE", unwritableFileMessage(what, path, cwd, error), {
      cause: error,
    });
  }
}

interface HandoffFile {
  readonly locale: string;
  readonly content: string;
}

async function writeDirectoryFiles(
  fs: SdkFs,
  cwd: string,
  directory: string,
  format: DirectoryFormat,
  files: readonly HandoffFile[],
): Promise<void> {
  await writeHandoff("the handoff directory", directory, cwd, async () => {
    await fs.mkdir?.(directory);
  });
  for (const file of files) {
    const path = join(directory, handoffFileName(file.locale, format));
    await writeHandoff("the handoff file", path, cwd, () => fs.writeFile(path, file.content));
  }
  const family = handoffFamily(format);
  const manifestPath = join(directory, exportManifestFileName(family));
  await writeHandoff("the export manifest", manifestPath, cwd, () =>
    writeExportManifest(
      fs,
      directory,
      family,
      files.map((file) => file.locale),
    ),
  );
}

interface ExportedSheet extends WorkbookSheet {
  readonly baseline: ReadonlyMap<string, string>;
}

interface RenderContext {
  readonly config: VerbatraConfig;
  readonly source: LocaleResource;
  readonly provenance: LocaleProvenance | undefined;
}

function renderDirectoryFile(
  format: DirectoryFormat,
  sheet: ExportedSheet,
  context: RenderContext,
): HandoffFile {
  if (!isXliffFormat(format)) {
    return { locale: sheet.locale, content: buildDelimited(sheet, format) };
  }
  const units = xliffUnits({
    rows: sheet.rows,
    source: context.source,
    records: context.provenance?.(sheet.locale) ?? new Map(),
    baseline: sheet.baseline,
  });
  return {
    locale: sheet.locale,
    content: buildXliff({
      version: xliffVersionOf(format),
      sourceLanguage: context.config.sourceLocale,
      targetLanguage: sheet.locale,
      units,
    }),
  };
}

async function writeWorkbookFile(
  fs: SdkFs,
  cwd: string,
  path: string,
  sheets: readonly WorkbookSheet[],
): Promise<void> {
  const model: WorkbookModel = { sheets };
  const bytes = await buildWorkbook(model);
  await writeHandoff("the handoff file", path, cwd, async () => {
    await fs.mkdir?.(dirname(path));
    await fs.writeBytes(path, bytes);
  });
}

function reservedFor(input: ExportWorkbookInput, cwd: string): ReadonlyMap<string, ReservedPath> {
  return reservedProjectPaths({
    cwd,
    config: input.config,
    resolver: createLocalePathResolver(cwd, input.config),
    ...(input.configPath !== undefined ? { configPath: input.configPath } : {}),
    ...(input.glossaryPath !== undefined ? { glossaryPath: input.glossaryPath } : {}),
  });
}

async function resolveHandoffPath(
  guard: OutputGuard,
  input: ExportWorkbookInput,
  format: ExchangeFormat,
  locales: readonly string[],
): Promise<string> {
  if (!isDirectoryFormat(format)) {
    return resolveWorkbookPath(guard, input.out ?? DEFAULT_WORKBOOK_PATH);
  }
  return resolveDelimitedDirectory(guard, input.out ?? DEFAULT_DELIMITED_PATH, [
    ...locales.map((locale) => handoffFileName(locale, format)),
    exportManifestFileName(handoffFamily(format)),
  ]);
}

/**
 * Writes the strings awaiting translation to a handoff a human translator can work in: a styled
 * `.xlsx` workbook with one sheet per locale, one `.csv` or `.tsv` file per locale, or one XLIFF
 * `.xlf` file per locale for a CAT tool. A delimited or XLIFF export also writes a
 * `.verbatra-export-<csv|tsv|xliff>.json` manifest into the output directory naming the locales it
 * exported, which {@link importWorkbook} uses to tell a leftover file from an earlier export apart
 * from a current one.
 *
 * An XLIFF file (`xliff2` writes version 2.0, `xliff12` version 1.2) holds one unit per key, named
 * by the key. Placeholders, inline markup and ICU structure become inline codes a CAT tool shows
 * and protects, the key's description and meaning become notes, and the source hash travels in the
 * unit's metadata. Each unit's state comes from the lock and review state: a missing or stale key
 * is `initial` (1.2: `new`, or `needs-translation` with the stale translation as the target), an
 * up-to-date translation is `translated`, an approved one is `reviewed` (1.2: `signed-off` and
 * `approved="yes"`), and a rejected one is `initial` again.
 *
 * By default only missing and stale keys are exported, which is what makes the handoff a work list
 * rather than a dump of the whole project. Each row carries the source text alongside any existing
 * translation and a review status, so the translator sees what changed and why a string was
 * flagged. An existing translation whose ICU branch arms do not fit the target language, the check
 * the write-time gate applies, is flagged `icu-arms` with each wrong arm named.
 *
 * This is the outbound half of the exchange; {@link importWorkbook} reads the filled handoff back
 * through the same diff, lock, and integrity checks. It writes only the handoff file and never
 * touches the locale files or the lock-file.
 *
 * Note that a malformed target locale file surfaces the adapter's own error and code rather than a
 * wrapped {@link SdkError}, because only source reads are wrapped. Its message names the offending
 * locale and the resolved path. A caller that maps SDK codes should be ready for an unrecognized
 * error from a target file.
 *
 * The output path is checked before anything is read or written, and a handoff that could not be
 * written surfaces as `EXPORT_UNWRITABLE`, never as a raw file-system error. An existing file at
 * the output path is replaced.
 *
 * @param input - The config, output path, config and glossary paths to protect, locale filter, and
 * handoff format.
 * @param deps - Optional adapter registry and file-system overrides.
 * @returns The path written and the per-locale row counts.
 *
 * @throws {@link SdkError} `UNKNOWN_FORMAT`: no adapter is registered for the configured format.
 * @throws {@link SdkError} `LOCALE_LAYOUT_INVALID`: the `files.pattern` and `files.localeStyle`
 * cannot be combined, or a configured locale has no valid path spelling under that style.
 * @throws {@link SdkError} `LOCALE_PATH_COLLISION`: two configured locales resolve to the same path.
 * @throws {@link SdkError} `SOURCE_UNREADABLE`: the source locale file does not exist.
 * @throws {@link SdkError} `SOURCE_INVALID`: the source locale file could not be parsed.
 * @throws {@link SdkError} `LOCK_FILE_INVALID`: the lock-file is corrupt, oversized, or at an
 * unsupported version.
 * @throws {@link SdkError} `UNKNOWN_LOCALE`: a requested locale is not a configured target locale.
 * @throws {@link SdkError} `EXPORT_OUTPUT_CONFLICT`: the output path is refused (see
 * {@link ExportWorkbookInput.out} for the full set), before anything is read or written.
 * @throws {@link SdkError} `EXPORT_UNWRITABLE`: the output directory could not be created or a
 * handoff file could not be written, because the directory is not writable, a directory or file
 * already sits in the way, or the disk is out of space. A missing output directory is created
 * automatically and is not a cause. The message names the file relative to `cwd` and the
 * underlying file-system code, never the internal temporary file the atomic write uses, and the
 * file-system error is the `cause`.
 */
export async function exportWorkbook(
  input: ExportWorkbookInput,
  deps: ExportWorkbookDeps = {},
): Promise<ExportWorkbookResult> {
  const config = input.config;
  const cwd = input.cwd ?? process.cwd();
  const fs = deps.fs ?? defaultFs;
  const adapter = selectAdapter(config.format, deps.adapterRegistry, deps.fs);
  const resolver = createLocalePathResolver(cwd, config);
  const maxLengthBudgets = toMaxLengthMap(config.maxLength);
  const locales = selectLocales(config, input.locales);
  const format = input.format ?? DEFAULT_EXCHANGE_FORMAT;
  const path = await resolveHandoffPath(
    { cwd, paths: createOutputPathGuard(fs, cwd, reservedFor(input, cwd)) },
    input,
    format,
    locales,
  );

  const source = await readSourceResource(config, resolver, fs, adapter);
  const lock = await readCarriedOverLock(cwd, fs, locales);

  const sheets: readonly ExportedSheet[] = await Promise.all(
    locales.map(async (locale) => {
      const target = await readTargetResource({
        resolver,
        format: config.format,
        locale,
        adapter,
        fs,
      });
      const baseline = baselineFor(lock, locale);
      const rows = buildRows(
        source.resource,
        target,
        baseline,
        input.includeUnchanged ?? false,
        adapter,
        glossaryForLocale(config.glossary, locale),
        maxLengthBudgets,
      );
      return { locale, rows, baseline };
    }),
  );

  if (isDirectoryFormat(format)) {
    const context: RenderContext = {
      config,
      source: source.resource,
      provenance: isXliffFormat(format)
        ? await readCarriedOverProvenance(cwd, fs, locales)
        : undefined,
    };
    const files = sheets.map((sheet) => renderDirectoryFile(format, sheet, context));
    await writeDirectoryFiles(fs, cwd, path, format, files);
  } else {
    await writeWorkbookFile(fs, cwd, path, sheets);
  }

  return {
    path,
    locales: sheets.map((sheet) => ({ locale: sheet.locale, rows: sheet.rows.length })),
  };
}
