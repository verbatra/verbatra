import { dirname, join, resolve } from "node:path";
import { computeReviewFlags, type ReviewFlag } from "@verbatra/ai-providers";
import { checkPlaceholders, contentHash, diffResources, type LocaleResource } from "@verbatra/core";
import {
  buildDelimited,
  buildWorkbook,
  type DelimitedFormat,
  delimitedFileName,
  type ReviewStatus,
  type WorkbookModel,
  type WorkbookRow,
  type WorkbookSheet,
} from "@verbatra/exchange";
import type { AdapterRegistry, FormatAdapter } from "@verbatra/format-adapters";
import type { VerbatraConfig } from "../../config/schema.js";
import { defaultFs, type SdkFs } from "../../fs.js";
import { createLocalePathResolver } from "../../locale-path/resolver.js";
import { baselineFor, lockFilePath, readLockFile } from "../../lock/lock-file.js";
import { selectAdapter } from "../../selection/select-adapter.js";
import { readTargetResource } from "../read-target.js";
import { selectLocales } from "../select-locales.js";
import { readSourceResource } from "../source.js";
import {
  DEFAULT_EXCHANGE_FORMAT,
  type ExchangeFormat,
  isDelimitedFormat,
} from "./exchange-format.js";
import { writeExportManifest } from "./export-manifest.js";

/** Default output path for an `.xlsx` handoff, used when {@link ExportWorkbookInput.out} is omitted. */
export const DEFAULT_WORKBOOK_PATH = "verbatra-translations.xlsx";

/**
 * Default output directory for a delimited handoff. It carries no extension because it names a
 * directory, not a file: the export creates it and writes one `<locale>.<format>` file inside it
 * per exported locale, such as `de.csv`.
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
   * {@link DEFAULT_DELIMITED_PATH} for the delimited formats.
   */
  readonly out?: string;
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
  /** The absolute path written, or the shared base path when one file per locale was written. */
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

function reviewColumns(flag: ReviewFlag | undefined): {
  reviewStatus: ReviewStatus;
  reviewReasons: string;
} {
  if (flag === undefined) {
    return { reviewStatus: "ok", reviewReasons: "" };
  }
  return { reviewStatus: "review", reviewReasons: flag.reasons.map(reasonLabel).join(", ") };
}

function computeRowReview(
  adapter: FormatAdapter,
  sourceValue: string,
  currentTarget: string,
  sourceLocale: string,
  targetLocale: string,
  glossary: Readonly<Record<string, string>> | undefined,
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
  });
  return reviewColumns(flag);
}

function buildRows(
  source: LocaleResource,
  target: LocaleResource,
  baseline: ReadonlyMap<string, string>,
  includeUnchanged: boolean,
  adapter: FormatAdapter,
  glossary: Readonly<Record<string, string>> | undefined,
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

async function writeDelimitedFiles(
  fs: SdkFs,
  directory: string,
  format: DelimitedFormat,
  sheets: readonly WorkbookSheet[],
): Promise<void> {
  await fs.mkdir?.(directory);
  for (const sheet of sheets) {
    await fs.writeFile(
      join(directory, delimitedFileName(sheet.locale, format)),
      buildDelimited(sheet, format),
    );
  }
  await writeExportManifest(
    fs,
    directory,
    format,
    sheets.map((sheet) => sheet.locale),
  );
}

/**
 * Writes the strings awaiting translation to a handoff a human translator can work in: a styled
 * `.xlsx` workbook with one sheet per locale, or one `.csv` or `.tsv` file per locale.
 *
 * By default only missing and stale keys are exported, which is what makes the handoff a work list
 * rather than a dump of the whole project. Each row carries the source text alongside any existing
 * translation and a review status, so the translator sees what changed and why a string was
 * flagged.
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
 * Writing the handoff itself is unwrapped in the same way. It is not a locale file, so a failure to
 * create the output directory or to write the file does not become `TARGET_UNWRITABLE`; the
 * underlying file-system error propagates as it is.
 *
 * @param input - The config, output path, locale filter, and handoff format.
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
 * @throws The underlying file-system error, unwrapped, when the handoff could not be written: `out`
 * resolves to a location the process lacks permission to write, or the device is full. A missing
 * output directory is created automatically and is not a cause. Branch on the Node `code`, such as
 * `EACCES` or `ENOSPC`, rather than on the message, which can name the internal temporary file the
 * atomic write uses.
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

  const source = await readSourceResource(config, resolver, fs, adapter);
  const lock = await readLockFile(lockFilePath(cwd), fs);

  const locales = selectLocales(config, input.locales);
  const sheets = await Promise.all(
    locales.map(async (locale) => {
      const target = await readTargetResource({
        resolver,
        format: config.format,
        locale,
        adapter,
        fs,
      });
      const rows = buildRows(
        source.resource,
        target,
        baselineFor(lock, locale),
        input.includeUnchanged ?? false,
        adapter,
        config.glossary,
      );
      return { locale, rows };
    }),
  );

  const format = input.format ?? DEFAULT_EXCHANGE_FORMAT;
  const path = resolve(
    cwd,
    input.out ?? (isDelimitedFormat(format) ? DEFAULT_DELIMITED_PATH : DEFAULT_WORKBOOK_PATH),
  );
  if (isDelimitedFormat(format)) {
    await writeDelimitedFiles(fs, path, format, sheets);
  } else {
    const model: WorkbookModel = { sheets };
    await fs.mkdir?.(dirname(path));
    await fs.writeBytes(path, await buildWorkbook(model));
  }

  return {
    path,
    locales: sheets.map((sheet) => ({ locale: sheet.locale, rows: sheet.rows.length })),
  };
}
