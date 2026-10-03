import { resolve } from "node:path";
import { contentHash, type LocaleResource, type TranslationEntry } from "@verbatra/core";
import {
  type DelimitedFormat,
  readDelimited,
  readWorkbook,
  type WorkbookData,
  type WorkbookDuplicateKey,
  type WorkbookRowProblem,
  type WorkbookSheet,
} from "@verbatra/exchange";
import type { AdapterRegistry, FormatAdapter } from "@verbatra/format-adapters";
import { fingerprintsFor } from "../../cache/fingerprint.js";
import { feedTranslationMemory } from "../../cache/translation-memory.js";
import type { CacheAddition } from "../../cache/types.js";
import type { VerbatraConfig } from "../../config/schema.js";
import { errorMessage, SdkError } from "../../errors.js";
import { defaultFs, type SdkFs } from "../../fs.js";
import { createLocalePathResolver, type LocalePathResolver } from "../../locale-path/resolver.js";
import { carrySourcelessLockEntry } from "../../lock/carry-forward.js";
import {
  assertLockAcquireTimeout,
  type LocaleWriteLockOptions,
  type LockWaitListener,
  recordLockOptions,
  withLocaleWriteLock,
  writeLockKeyFor,
  writeLockOptions,
} from "../../lock/locale-write-lock.js";
import {
  baselineFor,
  lockFilePath,
  readLockFile,
  updateLockFileLocale,
  withLockLocalesMoved,
} from "../../lock/lock-file.js";
import {
  type PendingProvenance,
  type ProvenancePatch,
  settleProvenance,
} from "../../lock/provenance-file.js";
import {
  isNewerProvenance,
  withNewerProvenanceNotice,
  withProvenanceWriteNotice,
} from "../../lock/provenance-notice.js";
import type { LockFile } from "../../lock/types.js";
import { selectAdapter } from "../../selection/select-adapter.js";
import {
  carryOverRefusal,
  carryOverRespelledLocales,
  type LocaleCarryOverPlan,
  withCarryOverNotices,
} from "../locale-carry-over.js";
import {
  failureSummary,
  isWholeRunError,
  partition,
  withProjectRelativeMessages,
} from "../locale-failure.js";
import { readTargetResource } from "../read-target.js";
import { assertReviewer } from "../review-decision.js";
import { readSourceResource } from "../source.js";
import { inSourceOrder } from "../source-order.js";
import type { LocaleSummary, RunSummary } from "../summary.js";
import { writeTargetResource } from "../write-target.js";
import { withApprovalNotice, withHandoffApprovals } from "../xliff/handoff-approvals.js";
import { type HandoffStates, readXliffHandoff } from "../xliff/xliff-import.js";
import {
  type DirectoryFormat,
  type ExchangeFormat,
  handoffExtension,
  importFormatFor,
  isDirectoryFormat,
  isXliffFormat,
} from "./exchange-format.js";
import { collectHandoffFiles, type HandoffSource } from "./handoff-files.js";
import { type ImportLocaleResult, importLocale } from "./import-locale.js";

const MAX_WORKBOOK_FILE_BYTES = 64 * 1024 * 1024;

/** Input for {@link importWorkbook}. */
export interface ImportWorkbookInput {
  /** The resolved project config, normally from {@link loadConfig}. */
  readonly config: VerbatraConfig;
  /**
   * Path to the filled handoff. For a delimited or XLIFF import the path is tried as a single file
   * first, so one individual `<locale>.<csv|tsv|xlf>` file can be imported on its own, with the
   * locale taken from its file name. A single XLIFF file whose name is not a configured target
   * locale is matched by the target language it declares instead. If no file exists there, the
   * path is treated as the directory the per-locale files were written into and every configured
   * target locale found inside is read.
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
  /**
   * The handoff shape to read. Defaults to the shape the extension of
   * {@link ImportWorkbookInput.workbook} names: `csv` for `.csv`, `tsv` for `.tsv`, `xliff2` for
   * `.xlf` or `.xliff`, and `xlsx` for `.xlsx`, a directory, or any other path. `xliff2` and
   * `xliff12` both read either XLIFF version, which is taken from the file.
   */
  readonly format?: ExchangeFormat;
  /**
   * Free text naming the reviewer, at most 64 characters with no control characters, recorded on
   * each value an XLIFF handoff marks `reviewed` or `final` (1.2: `signed-off`, `final`, or
   * `approved="yes"`). It is stored in the committed provenance file, so it is public. Other
   * handoff formats carry no review state, so it is not used for them.
   */
  readonly reviewer?: string;
  /**
   * Called while waiting on another process's write lock, so a CLI can explain a stall instead of
   * appearing to hang. Never called for a lock this process holds itself.
   */
  readonly onLockWait?: LockWaitListener;
  /**
   * How long, in milliseconds, to wait for a locale's write lock before that locale fails with
   * `LOCK_CONTENDED`. The wait happens before the locale file is written. Defaults to ten minutes.
   * It does not bound the lock-file guard a locale takes to record its result once its target file
   * is written: that wait always allows the ten-minute default, so a written file is not left
   * unrecorded. Not used on a dry run, which takes no lock.
   */
  readonly lockAcquireTimeoutMs?: number;
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

function parseDelimitedSources(
  sources: readonly HandoffSource[],
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
  readonly expectedLocales: readonly string[];
  readonly states?: HandoffStates;
}

async function readDirectoryHandoff(
  path: string,
  config: VerbatraConfig,
  fs: SdkFs,
  format: DirectoryFormat,
  source: LocaleResource,
): Promise<ImportRead> {
  const files = await collectHandoffFiles(path, config, fs, format);
  if (isXliffFormat(format)) {
    const handoff = readXliffHandoff(files, source, config);
    return {
      data: {
        sheets: handoff.sheets,
        malformedRows: handoff.malformedRows,
        duplicateKeys: handoff.duplicateKeys,
      },
      staleLocales: files.staleLocales,
      expectedLocales: handoff.expectedLocales,
      states: handoff.states,
    };
  }
  return {
    data: parseDelimitedSources(files.sources, format),
    staleLocales: files.staleLocales,
    expectedLocales: files.expectedLocales,
  };
}

async function readImportData(
  path: string,
  config: VerbatraConfig,
  fs: SdkFs,
  format: ExchangeFormat,
  source: LocaleResource,
): Promise<ImportRead> {
  try {
    if (isDirectoryFormat(format)) {
      return await readDirectoryHandoff(path, config, fs, format, source);
    }
    return {
      data: await readWorkbook(await readWorkbookBytes(path, fs)),
      staleLocales: [],
      expectedLocales: config.targetLocales,
    };
  } catch (error) {
    if (error instanceof SdkError) {
      throw error;
    }
    throw new SdkError("SOURCE_INVALID", errorMessage(error), { cause: error });
  }
}

function mergeAccepted(
  sourceResource: LocaleResource,
  target: LocaleResource,
  accepted: ImportLocaleResult["accepted"],
): Map<string, TranslationEntry> {
  const merged = new Map(target.entries);
  for (const [key, { value, source }] of inSourceOrder(sourceResource.entries.keys(), accepted)) {
    merged.set(key, { ...source, value, namespace: target.namespace });
  }
  return merged;
}

function importProvenance(
  written: LocaleResource,
  merged: ReadonlyMap<string, TranslationEntry>,
  accepted: ImportLocaleResult["accepted"],
): ProvenancePatch {
  const pending = new Map<string, PendingProvenance>();
  for (const [key, { value }] of accepted) {
    pending.set(key, { origin: "import", value });
  }
  return settleProvenance(pending, written, new Set(merged.keys()));
}

function sheetCacheAdditions(
  accepted: ImportLocaleResult["accepted"],
): Record<string, CacheAddition> {
  const record: Record<string, CacheAddition> = {};
  for (const [, { value, source, cleared }] of accepted) {
    if (!cleared) {
      record[contentHash(source)] = {
        contentHash: contentHash(source),
        value,
        source: source.value,
      };
    }
  }
  return record;
}

function collectSheetAdditions(
  byLocale: Map<string, Record<string, CacheAddition>>,
  locale: string,
  additions: Record<string, CacheAddition>,
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
  readonly states: HandoffStates | undefined;
  readonly reviewer: string | undefined;
}

function plainFileName(locale: string, format: DirectoryFormat): string {
  return `${locale}.${handoffExtension(format)}`;
}

class MissingSheetError extends Error {
  readonly code = "WORKBOOK_SHEET_MISSING";
  constructor(locale: string, format: ExchangeFormat) {
    super(
      isDirectoryFormat(format)
        ? `The handoff has no "${plainFileName(locale, format)}" file for the configured target locale "${locale}". ` +
            "The file may have been renamed, deleted, or left out of the directory."
        : `The workbook has no sheet (tab) for the configured target locale "${locale}". ` +
            "The tab may have been renamed, deleted, or reordered out of the workbook.",
    );
    this.name = "MissingSheetError";
  }
}

class StaleHandoffFileError extends Error {
  readonly code = "HANDOFF_FILE_STALE";
  constructor(locale: string, format: DirectoryFormat) {
    super(
      `The file "${plainFileName(locale, format)}" is left over from an earlier export that included the target locale "${locale}"; ` +
        "the most recent export into this directory did not. Its rows were not applied, because they " +
        "reflect that earlier run. Re-export the locale to refresh the file, or delete it.",
    );
    this.name = "StaleHandoffFileError";
  }
}

function absentLocaleFailures(
  expectedLocales: readonly string[],
  sheets: readonly WorkbookSheet[],
  format: ExchangeFormat,
  staleLocales: readonly string[],
): readonly LocaleSummary[] {
  const present = new Set(sheets.map((sheet) => sheet.locale));
  const stale = new Set(staleLocales);
  const failures: LocaleSummary[] = [];
  for (const locale of expectedLocales) {
    if (present.has(locale)) {
      continue;
    }
    const error =
      stale.has(locale) && isDirectoryFormat(format)
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
  provenance: ProvenancePatch;
  cacheAdditions: Record<string, CacheAddition>;
}> {
  if (!ctx.config.targetLocales.includes(sheet.locale)) {
    throw new SdkError(
      "CONFIG_INVALID",
      isDirectoryFormat(ctx.format)
        ? `The handoff has a file named "${plainFileName(sheet.locale, ctx.format)}", whose locale is not a configured target locale. ` +
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
  const states = ctx.states?.get(sheet.locale);
  const imported = importLocale({
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
    ...(states !== undefined ? { states } : {}),
  });
  const { accepted, approved } = imported;
  const summary = withApprovalNotice(imported.summary, approved, ctx.dryRun);

  if (ctx.dryRun) {
    return { summary, lockEntries: {}, provenance: { records: new Map() }, cacheAdditions: {} };
  }

  const merged = mergeAccepted(ctx.source, target, accepted);
  let written: LocaleResource = { ...target, entries: merged };
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
      { sourcePath: ctx.resolver.pathFor(ctx.config.sourceLocale) },
    );
    written = await readTargetResource({
      resolver: ctx.resolver,
      format: ctx.config.format,
      locale: sheet.locale,
      adapter: ctx.adapter,
      fs: ctx.fs,
    });
  }
  return {
    summary,
    lockEntries: computeSheetLockEntries(ctx.source, merged, baseline, accepted),
    provenance: await withHandoffApprovals(importProvenance(written, merged, accepted), {
      cwd: ctx.cwd,
      fs: ctx.fs,
      locale: sheet.locale,
      approved,
      written,
      source: ctx.source,
      reviewer: ctx.reviewer,
    }),
    cacheAdditions: sheetCacheAdditions(accepted),
  };
}

interface SheetImport {
  readonly ctx: SheetContext;
  readonly lock: LockFile;
  readonly carryOver: LocaleCarryOverPlan;
  readonly lockOptions: LocaleWriteLockOptions;
  readonly recordOptions: LocaleWriteLockOptions;
  readonly cacheAdditions: Map<string, Record<string, CacheAddition>>;
}

async function importSheet(run: SheetImport, sheet: WorkbookSheet): Promise<LocaleSummary> {
  const { ctx } = run;
  const refusal = carryOverRefusal(run.carryOver, sheet.locale, ctx.dryRun ? "dry-run" : "run");
  if (refusal !== undefined) {
    throw refusal;
  }
  if (ctx.dryRun) {
    return (await runSheet(ctx, sheet, run.lock)).summary;
  }
  return withLocaleWriteLock(
    ctx.cwd,
    writeLockKeyFor(ctx.config.format, sheet.locale),
    ctx.fs,
    async () => {
      const result = await runSheet(ctx, sheet, run.lock);
      const update = await updateLockFileLocale(
        ctx.cwd,
        ctx.fs,
        sheet.locale,
        { mode: "replace", entries: result.lockEntries },
        result.provenance,
        run.recordOptions,
      );
      collectSheetAdditions(run.cacheAdditions, sheet.locale, result.cacheAdditions);
      return withProvenanceWriteNotice(result.summary, update.provenance);
    },
    run.lockOptions,
  );
}

/**
 * Reads a filled translator handoff back into the locale files. It is the inbound half of the
 * exchange that {@link exportWorkbook} starts, and it calls no provider: every value comes from the
 * handoff.
 *
 * Imported values are held to the same integrity gate as provider output, so a translator who drops
 * a placeholder, breaks inline markup or breaks ICU syntax has that row refused rather than
 * written, and a row whose source text changed since the export is refused the same way. A row
 * holding exactly `[[CLEAR]]` empties that key's translation. Each locale takes its write lock, and
 * the lock-file and translation memory are updated exactly as in a {@link translate} run, so an
 * imported translation counts as up to date afterwards. Each accepted row is recorded in the
 * provenance file with the origin `import`.
 *
 * Damage is contained rather than fatal: a blank row keeps the existing translation and its
 * baseline, an unreadable row is reported as a {@link MalformedRowReport}, and a repeated key is
 * reported as a {@link DuplicateKeyReport} with the first occurrence winning. All three surface on
 * the returned {@link RunSummary} rather than aborting the import. A sheet or file naming a locale
 * that is not configured is contained the same way: that locale fails with `CONFIG_INVALID` on its
 * own {@link LocaleSummary}, so nothing is written to an unmanaged path and the configured locales
 * still import. A configured target locale the handoff carries no sheet or file for fails with
 * `WORKBOOK_SHEET_MISSING`, a delimited file the directory's export manifest does not list fails
 * with `HANDOFF_FILE_STALE` without being applied, and a row naming a key neither the source nor
 * the target holds fails its locale. Once the handoff has been read, every per-locale failure is
 * isolated this way, so callers should inspect {@link RunSummary.failed} and
 * {@link RunSummary.partial} rather than relying on a thrown error. A locale whose write lock stays
 * contended past `lockAcquireTimeoutMs` is one of these per-locale failures: it is recorded with
 * code `LOCK_CONTENDED` on that locale's summary, before its file is written, rather than thrown.
 * A corrupt lock-file is the one exception, because it is a single
 * shared file rather than a per-locale one: it aborts the whole run even when it is discovered
 * after a locale has been applied, so the locales still to come are not written at all.
 *
 * @param input - The config and the handoff path, format, and dry-run flag.
 * @param deps - Optional adapter registry and file-system overrides.
 * @returns The per-locale account of what was applied.
 *
 * @throws {@link SdkError} `LOCK_TIMEOUT_INVALID`: `lockAcquireTimeoutMs` is not a whole number of
 * milliseconds of at least 0. Thrown before anything is read.
 * @throws {@link SdkError} `REVIEWER_INVALID`: the reviewer is empty, longer than 64 characters, or
 * contains a control character. Thrown before anything is read.
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
 * @throws {@link SdkError} `PROVENANCE_FILE_INVALID`: the provenance file is corrupt, oversized, or
 * structurally wrong. Checked like the lock-file: before any locale is applied, and again as each
 * locale's result is recorded. A dry run does not read it.
 */
export async function importWorkbook(
  input: ImportWorkbookInput,
  deps: ImportWorkbookDeps = {},
): Promise<RunSummary> {
  const config = input.config;
  const cwd = input.cwd ?? process.cwd();
  const dryRun = input.dryRun ?? false;
  assertLockAcquireTimeout(input.lockAcquireTimeoutMs);
  assertReviewer(input.reviewer);
  const fs = deps.fs ?? defaultFs;
  const adapter = selectAdapter(config.format, deps.adapterRegistry, deps.fs);
  const resolver = createLocalePathResolver(cwd, config);

  const source = await readSourceResource(config, resolver, fs, adapter);
  const format = importFormatFor(input.format, input.workbook);
  const { data, staleLocales, expectedLocales, states } = await readImportData(
    resolve(cwd, input.workbook),
    config,
    fs,
    format,
    source.resource,
  );

  const lockOptions = writeLockOptions(input);
  const carryOver = await carryOverRespelledLocales(
    cwd,
    fs,
    data.sheets
      .map((sheet) => sheet.locale)
      .filter((locale) => config.targetLocales.includes(locale)),
    { dryRun, memory: true, lock: lockOptions },
  );
  const lock = withLockLocalesMoved(await readLockFile(lockFilePath(cwd), fs), carryOver.lock);
  const newerProvenance = !dryRun && (await isNewerProvenance(cwd, fs));

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
    states,
    reviewer: input.reviewer,
  };

  const recordOptions = recordLockOptions(input);
  const summaries: LocaleSummary[] = [];
  const cacheAdditions = new Map<string, Record<string, CacheAddition>>();
  for (const sheet of data.sheets) {
    try {
      const summary = await importSheet(
        { ctx, lock, carryOver, lockOptions, recordOptions, cacheAdditions },
        sheet,
      );
      summaries.push(summary);
    } catch (error) {
      if (isWholeRunError(error)) {
        throw error;
      }
      summaries.push(failureSummary(sheet.locale, error));
    }
  }

  summaries.push(...absentLocaleFailures(expectedLocales, data.sheets, format, staleLocales));

  if (!dryRun) {
    await feedTranslationMemory(cwd, fs, fingerprintsFor(config), cacheAdditions);
  }

  const locales = withCarryOverNotices(
    withNewerProvenanceNotice(summaries, newerProvenance),
    carryOver,
    dryRun,
  ).map((summary) => withProjectRelativeMessages(summary, cwd));
  const { succeeded, partial, failed } = partition(locales);
  return { dryRun, locales, succeeded, partial, failed };
}
