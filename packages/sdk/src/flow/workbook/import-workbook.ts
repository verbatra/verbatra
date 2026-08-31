import { basename, join, resolve } from "node:path";
import { contentHash, type LocaleResource, type TranslationEntry } from "@verbatra/core";
import {
  type DelimitedFormat,
  delimitedFileName,
  readDelimited,
  readWorkbook,
  type WorkbookData,
  type WorkbookDuplicateKey,
  type WorkbookRowProblem,
  type WorkbookSheet,
} from "@verbatra/exchange";
import type { AdapterRegistry, FormatAdapter } from "@verbatra/format-adapters";
import { computeFingerprint } from "../../cache/fingerprint.js";
import { feedTranslationMemory } from "../../cache/translation-memory.js";
import type { VerbatraConfig } from "../../config/schema.js";
import { errorMessage, SdkError } from "../../errors.js";
import { defaultFs, type SdkFs } from "../../fs.js";
import { createLocalePathResolver, type LocalePathResolver } from "../../locale-path/resolver.js";
import { carrySourcelessLockEntry } from "../../lock/carry-forward.js";
import { withLocaleWriteLock, writeLockKeyFor } from "../../lock/locale-write-lock.js";
import {
  baselineFor,
  lockFilePath,
  readLockFile,
  updateLockFileLocale,
} from "../../lock/lock-file.js";
import type { LockFile } from "../../lock/types.js";
import { selectAdapter } from "../../selection/select-adapter.js";
import { failureSummary, partition } from "../locale-failure.js";
import { readTargetResource } from "../read-target.js";
import { readSourceResource } from "../source.js";
import type { LocaleSummary, RunSummary } from "../summary.js";
import { writeTargetResource } from "../write-target.js";
import {
  DEFAULT_EXCHANGE_FORMAT,
  type ExchangeFormat,
  isDelimitedFormat,
} from "./exchange-format.js";
import { readExportedLocales } from "./export-manifest.js";
import { type ImportLocaleResult, importLocale } from "./import-locale.js";

const MAX_WORKBOOK_FILE_BYTES = 64 * 1024 * 1024;

const MAX_DELIMITED_FILE_BYTES = 32 * 1024 * 1024;

/** Input for {@link importWorkbook}. */
export interface ImportWorkbookInput {
  /** The resolved project config, normally from {@link loadConfig}. */
  readonly config: VerbatraConfig;
  /**
   * Path to the filled handoff. For a delimited import the path is tried as a single file first,
   * so one individual `<locale>.<format>` file can be imported on its own, with the locale taken
   * from its file name. If no file exists there, the path is treated as the directory the
   * per-locale files were written into and every configured target locale found inside is read.
   */
  readonly workbook: string;
  /** Directory the `files.pattern` and `workbook` are resolved against. Defaults to the process working directory. */
  readonly cwd?: string;
  /**
   * Read and validate the handoff but write nothing. The returned {@link RunSummary} reports what
   * would have been applied, which is the safe way to inspect a handoff before trusting it.
   * Defaults to false.
   */
  readonly dryRun?: boolean;
  /** The handoff shape to read. Defaults to `xlsx`. */
  readonly format?: ExchangeFormat;
}

/** Injectable dependencies for {@link importWorkbook}. Every field has a working default. */
export interface ImportWorkbookDeps {
  /** Format-adapter registry to resolve the configured format. Defaults to the built-in registry. */
  readonly adapterRegistry?: AdapterRegistry;
  /** File-system port. Defaults to the real file system. */
  readonly fs?: SdkFs;
}

async function readWorkbookBytes(path: string, fs: SdkFs): Promise<Uint8Array> {
  const read = await fs.readBytesBounded(path, MAX_WORKBOOK_FILE_BYTES);
  if (read.kind === "missing") {
    throw new SdkError("SOURCE_UNREADABLE", `The workbook was not found at ${path}.`);
  }
  if (read.kind === "too-large") {
    throw new SdkError(
      "SOURCE_INVALID",
      `The workbook at ${path} exceeds the maximum allowed size of ${MAX_WORKBOOK_FILE_BYTES} bytes.`,
    );
  }
  return read.bytes;
}

interface DelimitedSource {
  readonly locale: string;
  readonly text: string;
}

interface DelimitedHandoff {
  readonly sources: readonly DelimitedSource[];
  readonly staleLocales: readonly string[];
}

async function readDelimitedText(path: string, fs: SdkFs): Promise<string | undefined> {
  const read = await fs.readFileBounded(path, MAX_DELIMITED_FILE_BYTES);
  if (read.kind === "missing") {
    return undefined;
  }
  if (read.kind === "too-large") {
    throw new SdkError(
      "SOURCE_INVALID",
      `The interchange file at ${path} exceeds the maximum allowed size of ${MAX_DELIMITED_FILE_BYTES} bytes.`,
    );
  }
  return read.content;
}

async function collectDelimitedSources(
  path: string,
  config: VerbatraConfig,
  fs: SdkFs,
  format: DelimitedFormat,
): Promise<DelimitedHandoff> {
  const single = await readDelimitedText(path, fs);
  if (single !== undefined) {
    return { sources: [{ locale: basename(path, `.${format}`), text: single }], staleLocales: [] };
  }
  const exported = await readExportedLocales(fs, path, format);
  const sources: DelimitedSource[] = [];
  const staleLocales: string[] = [];
  for (const locale of config.targetLocales) {
    const text = await readDelimitedText(join(path, delimitedFileName(locale, format)), fs);
    if (text === undefined) {
      continue;
    }
    if (exported !== undefined && !exported.has(locale)) {
      staleLocales.push(locale);
      continue;
    }
    sources.push({ locale, text });
  }
  if (sources.length === 0 && staleLocales.length === 0) {
    throw new SdkError(
      "SOURCE_UNREADABLE",
      `No ${format} file was found at ${path}, and it holds no <locale>.${format} file for any configured target locale.`,
    );
  }
  return { sources, staleLocales };
}

function parseDelimitedSources(
  sources: readonly DelimitedSource[],
  format: DelimitedFormat,
): WorkbookData {
  const sheets: WorkbookSheet[] = [];
  const malformedRows: WorkbookRowProblem[] = [];
  const duplicateKeys: WorkbookDuplicateKey[] = [];
  for (const source of sources) {
    const data = readDelimited({ text: source.text, locale: source.locale, format });
    sheets.push(...data.sheets);
    malformedRows.push(...data.malformedRows);
    duplicateKeys.push(...data.duplicateKeys);
  }
  return { sheets, malformedRows, duplicateKeys };
}

interface ImportRead {
  readonly data: WorkbookData;
  readonly staleLocales: readonly string[];
}

async function readImportData(
  path: string,
  config: VerbatraConfig,
  fs: SdkFs,
  format: ExchangeFormat,
): Promise<ImportRead> {
  try {
    if (isDelimitedFormat(format)) {
      const handoff = await collectDelimitedSources(path, config, fs, format);
      return {
        data: parseDelimitedSources(handoff.sources, format),
        staleLocales: handoff.staleLocales,
      };
    }
    return { data: await readWorkbook(await readWorkbookBytes(path, fs)), staleLocales: [] };
  } catch (error) {
    if (error instanceof SdkError) {
      throw error;
    }
    throw new SdkError("SOURCE_INVALID", errorMessage(error));
  }
}

function mergeAccepted(
  target: LocaleResource,
  accepted: ImportLocaleResult["accepted"],
): Map<string, TranslationEntry> {
  const merged = new Map(target.entries);
  for (const [key, { value, source }] of accepted) {
    merged.set(key, { ...source, value, namespace: target.namespace });
  }
  return merged;
}

function sheetCacheAdditions(accepted: ImportLocaleResult["accepted"]): Record<string, string> {
  const record: Record<string, string> = {};
  for (const [, { value, source, cleared }] of accepted) {
    if (!cleared) {
      record[contentHash(source)] = value;
    }
  }
  return record;
}

function collectSheetAdditions(
  byLocale: Map<string, Record<string, string>>,
  locale: string,
  additions: Record<string, string>,
): void {
  if (Object.keys(additions).length === 0) {
    return;
  }
  byLocale.set(locale, { ...byLocale.get(locale), ...additions });
}

function computeSheetLockEntries(
  source: LocaleResource,
  merged: ReadonlyMap<string, TranslationEntry>,
  baseline: ReadonlyMap<string, string>,
  accepted: ImportLocaleResult["accepted"],
): Record<string, string> {
  const entries = new Map<string, string>();
  for (const key of merged.keys()) {
    const sourceEntry = source.entries.get(key);
    if (sourceEntry === undefined) {
      carrySourcelessLockEntry(entries, baseline, key);
      continue;
    }
    if (accepted.has(key)) {
      entries.set(key, contentHash(sourceEntry));
      continue;
    }
    const prior = baseline.get(key);
    entries.set(key, prior !== undefined ? prior : contentHash(sourceEntry));
  }
  return Object.fromEntries(entries);
}

interface SheetContext {
  readonly config: VerbatraConfig;
  readonly cwd: string;
  readonly resolver: LocalePathResolver;
  readonly adapter: FormatAdapter;
  readonly fs: SdkFs;
  readonly source: LocaleResource;
  readonly sourceInvalidIcuKeys: readonly string[];
  readonly dryRun: boolean;
  readonly malformedRows: WorkbookData["malformedRows"];
  readonly duplicateKeys: WorkbookData["duplicateKeys"];
  readonly format: ExchangeFormat;
}

class MissingSheetError extends Error {
  readonly code = "WORKBOOK_SHEET_MISSING";
  constructor(locale: string, format: ExchangeFormat) {
    super(
      isDelimitedFormat(format)
        ? `The handoff has no "${delimitedFileName(locale, format)}" file for the configured target locale "${locale}". ` +
            "The file may have been renamed, deleted, or left out of the directory."
        : `The workbook has no sheet (tab) for the configured target locale "${locale}". ` +
            "The tab may have been renamed, deleted, or reordered out of the workbook.",
    );
    this.name = "MissingSheetError";
  }
}

class StaleHandoffFileError extends Error {
  readonly code = "HANDOFF_FILE_STALE";
  constructor(locale: string, format: DelimitedFormat) {
    super(
      `The file "${delimitedFileName(locale, format)}" is left over from an earlier export that included the target locale "${locale}"; ` +
        "the most recent export into this directory did not. Its rows were not applied, because they " +
        "reflect that earlier run. Re-export the locale to refresh the file, or delete it.",
    );
    this.name = "StaleHandoffFileError";
  }
}

function absentLocaleFailures(
  config: VerbatraConfig,
  sheets: readonly WorkbookSheet[],
  format: ExchangeFormat,
  staleLocales: readonly string[],
): readonly LocaleSummary[] {
  const present = new Set(sheets.map((sheet) => sheet.locale));
  const stale = new Set(staleLocales);
  const failures: LocaleSummary[] = [];
  for (const locale of config.targetLocales) {
    if (present.has(locale)) {
      continue;
    }
    const error =
      stale.has(locale) && isDelimitedFormat(format)
        ? new StaleHandoffFileError(locale, format)
        : new MissingSheetError(locale, format);
    failures.push(failureSummary(locale, error));
  }
  return failures;
}

function lineOf(reported: { readonly line?: number }): { readonly line?: number } {
  return reported.line === undefined ? {} : { line: reported.line };
}

async function runSheet(
  ctx: SheetContext,
  sheet: WorkbookSheet,
  lock: LockFile,
): Promise<{
  summary: LocaleSummary;
  lockEntries: Record<string, string>;
  cacheAdditions: Record<string, string>;
}> {
  if (!ctx.config.targetLocales.includes(sheet.locale)) {
    throw new SdkError(
      "CONFIG_INVALID",
      isDelimitedFormat(ctx.format)
        ? `The handoff has a file named "${sheet.locale}.${ctx.format}", whose locale is not a configured target locale. ` +
            "Name every interchange file exactly as it was exported."
        : `The workbook has a sheet named "${sheet.locale}", which is not a configured target locale. ` +
            "It may be a renamed, added, or reordered tab; leave every language tab named exactly as exported.",
    );
  }
  const target = await readTargetResource({
    resolver: ctx.resolver,
    format: ctx.config.format,
    locale: sheet.locale,
    adapter: ctx.adapter,
    fs: ctx.fs,
  });
  const baseline = baselineFor(lock, sheet.locale);
  const { summary, accepted } = importLocale({
    sheet,
    source: ctx.source,
    target,
    baseline,
    adapter: ctx.adapter,
    sourceInvalidIcuKeys: ctx.sourceInvalidIcuKeys,
    malformedRows: ctx.malformedRows
      .filter((problem) => problem.locale === sheet.locale)
      .map((problem) => ({ row: problem.row, column: problem.column, ...lineOf(problem) })),
    duplicateKeys: ctx.duplicateKeys
      .filter((duplicate) => duplicate.locale === sheet.locale)
      .map((duplicate) => ({ key: duplicate.key, row: duplicate.row, ...lineOf(duplicate) })),
  });

  if (ctx.dryRun) {
    return { summary, lockEntries: {}, cacheAdditions: {} };
  }

  const merged = mergeAccepted(target, accepted);
  if (accepted.size > 0) {
    const path = ctx.resolver.pathFor(sheet.locale);
    await writeTargetResource(
      ctx.adapter,
      {
        locale: sheet.locale,
        namespace: target.namespace,
        format: ctx.config.format,
        entries: merged,
      },
      path,
      ctx.cwd,
    );
  }
  return {
    summary,
    lockEntries: computeSheetLockEntries(ctx.source, merged, baseline, accepted),
    cacheAdditions: sheetCacheAdditions(accepted),
  };
}

/**
 * Reads a filled translator handoff back into the locale files. It is the inbound half of the
 * exchange that {@link exportWorkbook} starts, and it calls no provider: every value comes from the
 * handoff.
 *
 * Imported values are held to the same integrity gate as provider output, so a translator who drops
 * a placeholder or breaks ICU syntax has that row refused rather than written. Each locale takes
 * its write lock, and the lock-file and translation memory are updated exactly as in a
 * {@link translate} run, so an imported translation counts as up to date afterwards.
 *
 * Damage is contained rather than fatal: a blank row keeps the existing translation and its
 * baseline, an unreadable row is reported as a {@link MalformedRowReport}, and a repeated key is
 * reported as a {@link DuplicateKeyReport} with the first occurrence winning. All three surface on
 * the returned {@link RunSummary} rather than aborting the import. A sheet or file naming a locale
 * that is not configured is contained the same way: that locale fails with `CONFIG_INVALID` on its
 * own {@link LocaleSummary}, so nothing is written to an unmanaged path and the configured locales
 * still import. Once the handoff has been read, every per-locale failure is isolated this way, so
 * callers should inspect {@link RunSummary.failed} and {@link RunSummary.partial} rather than
 * relying on a thrown error. A corrupt lock-file is the one exception, because it is a single
 * shared file rather than a per-locale one: it aborts the whole run even when it is discovered
 * after a locale has been applied, so the locales still to come are not written at all.
 *
 * @param input - The config and the handoff path, format, and dry-run flag.
 * @param deps - Optional adapter registry and file-system overrides.
 * @returns The per-locale account of what was applied.
 *
 * @throws {@link SdkError} `UNKNOWN_FORMAT`: no adapter is registered for the configured format.
 * @throws {@link SdkError} `SOURCE_UNREADABLE`: the handoff file was not found, or the source
 * locale file does not exist.
 * @throws {@link SdkError} `SOURCE_INVALID`: the handoff is oversized or could not be parsed, or
 * the source locale file could not be parsed.
 * @throws {@link SdkError} `LOCALE_LAYOUT_INVALID`: the `files.pattern` and `files.localeStyle`
 * cannot be combined, or a configured locale has no valid path spelling under that style.
 * @throws {@link SdkError} `LOCALE_PATH_COLLISION`: two configured locales resolve to the same path.
 * @throws {@link SdkError} `LOCK_FILE_INVALID`: the lock-file is corrupt, oversized, or at an
 * unsupported version. Read before any locale is applied, and re-read as each locale's entries are
 * recorded, so a lock-file that turns corrupt mid-run aborts the run rather than failing one locale.
 */
export async function importWorkbook(
  input: ImportWorkbookInput,
  deps: ImportWorkbookDeps = {},
): Promise<RunSummary> {
  const config = input.config;
  const cwd = input.cwd ?? process.cwd();
  const dryRun = input.dryRun ?? false;
  const fs = deps.fs ?? defaultFs;
  const adapter = selectAdapter(config.format, deps.adapterRegistry, deps.fs);
  const resolver = createLocalePathResolver(cwd, config);

  const source = await readSourceResource(config, resolver, fs, adapter);
  const format = input.format ?? DEFAULT_EXCHANGE_FORMAT;
  const { data, staleLocales } = await readImportData(
    resolve(cwd, input.workbook),
    config,
    fs,
    format,
  );

  const lock = await readLockFile(lockFilePath(cwd), fs);

  const ctx: SheetContext = {
    config,
    cwd,
    resolver,
    adapter,
    fs,
    source: source.resource,
    sourceInvalidIcuKeys: source.invalidIcuKeys,
    dryRun,
    malformedRows: data.malformedRows,
    duplicateKeys: data.duplicateKeys,
    format,
  };

  const summaries: LocaleSummary[] = [];
  const cacheAdditions = new Map<string, Record<string, string>>();
  for (const sheet of data.sheets) {
    try {
      let summary: LocaleSummary;
      if (dryRun) {
        summary = (await runSheet(ctx, sheet, lock)).summary;
      } else {
        summary = await withLocaleWriteLock(
          cwd,
          writeLockKeyFor(config.format, sheet.locale),
          fs,
          async () => {
            const result = await runSheet(ctx, sheet, lock);
            await updateLockFileLocale(cwd, fs, sheet.locale, {
              mode: "replace",
              entries: result.lockEntries,
            });
            collectSheetAdditions(cacheAdditions, sheet.locale, result.cacheAdditions);
            return result.summary;
          },
        );
      }
      summaries.push(summary);
    } catch (error) {
      if (error instanceof SdkError && error.code === "LOCK_FILE_INVALID") {
        throw error;
      }
      summaries.push(failureSummary(sheet.locale, error));
    }
  }

  summaries.push(...absentLocaleFailures(config, data.sheets, format, staleLocales));

  if (!dryRun) {
    await feedTranslationMemory(cwd, fs, computeFingerprint(config), cacheAdditions);
  }

  const { succeeded, partial, failed } = partition(summaries);
  return { dryRun, locales: summaries, succeeded, partial, failed };
}
