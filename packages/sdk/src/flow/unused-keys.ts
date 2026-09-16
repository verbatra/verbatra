import type { FormatId, LocaleResource } from "@verbatra/core";
import type { ProjectScan, ScanDiagnostic, SourceLocation } from "@verbatra/extract";
import { type AdapterRegistry, pluralBaseKey } from "@verbatra/format-adapters";
import type { ExtractionConfig } from "../config/extraction-config.js";
import type { VerbatraConfig } from "../config/schema.js";
import { SdkError, type SdkErrorCode } from "../errors.js";
import { defaultFs, type SdkFs } from "../fs.js";
import { selectAdapter } from "../selection/select-adapter.js";
import { matchesKeyGlob } from "./key-glob.js";
import { isGeneratedPluralKey } from "./plural-categories.js";
import { readSource } from "./source.js";
import { type CreateExtractor, requireExtractionConfig, runScan } from "./source-scan.js";
import { type CatalogKeyForms, catalogKeyForms } from "./unused-key-forms.js";

/**
 * Why an unused-key report could not be produced at all.
 *
 * - `EXTRACT_NOT_CONFIGURED`: the config carries no `extract` block, so there is no source to scan.
 * - `EXTRACT_FS_UNSUPPORTED`: the supplied file system implements no `readDirectory`.
 * - `FRAMEWORK_NOT_MODELED`: the configured format is loaded by a runtime (next-intl, Vue I18n, or
 *   ngx-translate) whose key lookups the i18next source scan does not model.
 * - `NO_SOURCE_FILES`: there is no source file under the configured roots at all.
 * - `NO_REFERENCES_FOUND`: the scanned files name no translation key and hold no dynamic key site,
 *   while the catalog is not empty, so the scan most likely looked at the wrong code.
 */
export type UnusedKeysNotRunReason =
  | "EXTRACT_NOT_CONFIGURED"
  | "EXTRACT_FS_UNSUPPORTED"
  | "FRAMEWORK_NOT_MODELED"
  | "NO_SOURCE_FILES"
  | "NO_REFERENCES_FOUND";

/**
 * Why a completed scan cannot rule a key unused with confidence.
 *
 * - `dynamic-keys`: a key argument has no static part (`t(key)`, a template literal with no static
 *   head, a concatenation), so any catalog key could be the one it reaches.
 * - `dynamic-key-prefix`: a `keyPrefix` option or a `getFixedT` prefix argument is not a static
 *   string, so every key called under it is unknown.
 * - `trans-without-key`: a `Trans` element carries no static `i18nKey`.
 * - `aliased-translate-function`: the translate function is assigned somewhere its calls cannot be
 *   followed, such as an object property.
 * - `template-files-not-scanned`: the roots hold template files (`.vue`, `.svelte`, `.html`, and
 *   similar) the scan does not read.
 * - `incomplete-scan`: a file or directory could not be read to its end.
 */
export type UnusedKeysUnreliableReason =
  | "dynamic-keys"
  | "dynamic-key-prefix"
  | "trans-without-key"
  | "aliased-translate-function"
  | "template-files-not-scanned"
  | "incomplete-scan";

/** One place that makes an unused-key report unreliable. */
export interface UnusedKeysSite {
  /** The file or directory, relative to the run's working directory, with forward slashes. */
  readonly file: string;
  /** The one-based line, when the reason points at a line. */
  readonly line?: number;
  /** For `incomplete-scan`, why the file was skipped (for example `too-large`). */
  readonly detail?: string;
}

/** One reason an unused-key report is unreliable, with the places that caused it. */
export interface UnusedKeysUnreliability {
  /** The stable reason code. */
  readonly reason: UnusedKeysUnreliableReason;
  /** How many places caused it. For template files this can exceed the listed `sites`. */
  readonly count: number;
  /**
   * The places, deduplicated on file and line. Every place is listed, except template files, which
   * are capped at the first 20.
   */
  readonly sites: readonly UnusedKeysSite[];
}

/**
 * A source-catalog key in an unused-key report. `key` is the key as a person and the source spell
 * it, with the format's internal encoding undone (`Welcome. Enjoy` rather than `Welcome\. Enjoy`,
 * a gettext `msgctxt` shown as `context|msgid`); `extract.unused.ignore` patterns match it.
 * `catalogKey` is the key exactly as the catalog adapter and the per-locale `orphaned` lists spell
 * it, for a tool that needs to address the entry.
 */
export interface UnusedKey {
  /** The decoded key, as shown to people and matched by `extract.unused.ignore`. */
  readonly key: string;
  /** The key as the catalog adapter encodes it. */
  readonly catalogKey: string;
}

/** A source-catalog key no static reference names, but a template-literal key could still reach. */
export interface PossiblyDynamicKey extends UnusedKey {
  /** The static head of the template-literal key that could reach it. */
  readonly prefix: string;
}

/** A template-literal key argument with a static head, located in the source. */
export interface UnusedKeysPrefixSite extends SourceLocation {
  /** The static head every key the site can reach starts with. */
  readonly prefix: string;
}

/** An unused-key report produced from a source scan. */
export interface UnusedKeysScan {
  /**
   * `complete` when nothing in the scan casts doubt on the verdict; `unreliable` when
   * {@link UnusedKeysScan.unreliableBecause} is not empty, so a listed key may still be in use.
   */
  readonly status: "complete" | "unreliable";
  /** Every reason the verdict cannot be trusted. Empty exactly when `status` is `complete`. */
  readonly unreliableBecause: readonly UnusedKeysUnreliability[];
  /** How many source files were read and scanned. */
  readonly scannedFiles: number;
  /** Source-catalog keys no scanned reference names, in catalog order. */
  readonly unused: readonly UnusedKey[];
  /**
   * Unreferenced source-catalog keys a template-literal key with a static head could reach, in
   * catalog order. They are listed apart from `unused` and never fail a run.
   */
  readonly possiblyDynamic: readonly PossiblyDynamicKey[];
  /** Unreferenced source-catalog keys matched by `extract.unused.ignore`, in catalog order. */
  readonly ignored: readonly UnusedKey[];
  /** The template-literal key sites behind `possiblyDynamic`. */
  readonly dynamicPrefixes: readonly UnusedKeysPrefixSite[];
}

/**
 * The source-locale catalog keys that nothing in the scanned source references. Distinct from the
 * per-locale `orphaned` lists, which compare a target locale against the source catalog.
 */
export type UnusedKeysReport = UnusedKeysNotRun | UnusedKeysScan;

/** An unused-key report that could not run. It carries no key list, so nothing is misreported. */
export interface UnusedKeysNotRun {
  /** Always `not-run`. */
  readonly status: "not-run";
  /** The stable reason code. Branch on this, not on the message. */
  readonly reason: UnusedKeysNotRunReason;
  /** A human-readable explanation. */
  readonly message: string;
}

export interface UnusedKeysInput {
  readonly config: VerbatraConfig;
  readonly cwd: string;
  readonly sourceCatalog?: LocaleResource;
}

export interface UnusedKeysDeps {
  readonly adapterRegistry?: AdapterRegistry;
  readonly fs?: SdkFs;
  readonly createExtractor?: CreateExtractor;
}

const NOT_RUN_ERROR_CODES: ReadonlySet<SdkErrorCode> = new Set([
  "EXTRACT_NOT_CONFIGURED",
  "EXTRACT_FS_UNSUPPORTED",
]);

const UNMODELED_FORMATS: ReadonlySet<FormatId> = new Set([
  "next-intl-json",
  "vue-i18n-json",
  "ngx-translate-json",
]);

const FILE_DIAGNOSTICS: ReadonlySet<ScanDiagnostic["reason"]> = new Set([
  "unreadable",
  "too-large",
  "unparseable",
]);

const TEMPLATE_SITE_LIMIT = 20;

const KEY_SEPARATOR = ".";

const VARIANT_SEPARATOR = "_";

function isNotRunError(error: unknown): error is SdkError & { code: UnusedKeysNotRunReason } {
  return error instanceof SdkError && NOT_RUN_ERROR_CODES.has(error.code);
}

function notRun(reason: UnusedKeysNotRunReason, message: string): UnusedKeysNotRun {
  return { status: "not-run", reason, message };
}

function unmodeledFormat(format: FormatId): UnusedKeysNotRun {
  return notRun(
    "FRAMEWORK_NOT_MODELED",
    `The ${format} format is loaded by a runtime whose key lookups the i18next source scan does ` +
      "not model, so no key can be judged unused.",
  );
}

async function scanSource(
  input: UnusedKeysInput,
  fs: SdkFs,
  createExtractor: CreateExtractor | undefined,
): Promise<
  { readonly scan: ProjectScan; readonly extraction: ExtractionConfig } | UnusedKeysNotRun
> {
  try {
    const extraction = requireExtractionConfig(input.config);
    if (UNMODELED_FORMATS.has(input.config.format)) {
      return unmodeledFormat(input.config.format);
    }
    return { scan: await runScan(extraction, input.cwd, fs, createExtractor), extraction };
  } catch (error) {
    if (isNotRunError(error)) {
      return notRun(error.code, error.message);
    }
    throw error;
  }
}

function referencedKeys(scan: ProjectScan): ReadonlySet<string> {
  const referenced = new Set<string>();
  const keys = [
    ...scan.usage.referencedKeys,
    ...scan.keys.map((entry) => entry.key),
    ...scan.conflicts.map((conflict) => conflict.key),
  ];
  for (const key of keys) {
    referenced.add(key);
    const base = pluralBaseKey(key);
    if (base !== undefined) {
      referenced.add(base);
    }
  }
  return referenced;
}

function hasReferencedPrefix(
  key: string,
  separator: string,
  referenced: ReadonlySet<string>,
  suffixAllowed: (suffix: string) => boolean,
): boolean {
  for (let cursor = key.lastIndexOf(separator); cursor > 0; ) {
    if (!suffixAllowed(key.slice(cursor + separator.length))) {
      return false;
    }
    if (referenced.has(key.slice(0, cursor))) {
      return true;
    }
    cursor = key.lastIndexOf(separator, cursor - 1);
  }
  return false;
}

function isContextVariantOfReferenced(key: string, referenced: ReadonlySet<string>): boolean {
  return hasReferencedPrefix(
    pluralBaseKey(key) ?? key,
    VARIANT_SEPARATOR,
    referenced,
    (suffix) => !suffix.includes(KEY_SEPARATOR),
  );
}

function isUnderReferencedParent(key: string, referenced: ReadonlySet<string>): boolean {
  return hasReferencedPrefix(key, KEY_SEPARATOR, referenced, () => true);
}

function isReferencedLookup(lookup: string, referenced: ReadonlySet<string>): boolean {
  return (
    referenced.has(lookup) ||
    isGeneratedPluralKey(lookup, referenced) ||
    isContextVariantOfReferenced(lookup, referenced) ||
    isUnderReferencedParent(lookup, referenced)
  );
}

function reachingPrefix(forms: CatalogKeyForms, prefixes: readonly string[]): string | undefined {
  return prefixes.find((prefix) => forms.lookups.some((lookup) => lookup.startsWith(prefix)));
}

function dedupedSites(sites: readonly UnusedKeysSite[]): readonly UnusedKeysSite[] {
  const seen = new Map<string, UnusedKeysSite>();
  for (const site of sites) {
    seen.set(`${site.file} ${site.line ?? ""} ${site.detail ?? ""}`, site);
  }
  return [...seen.values()];
}

function unreliability(
  reason: UnusedKeysUnreliableReason,
  sites: readonly UnusedKeysSite[],
  limit = Number.POSITIVE_INFINITY,
): readonly UnusedKeysUnreliability[] {
  const unique = dedupedSites(sites);
  return unique.length === 0
    ? []
    : [{ reason, count: unique.length, sites: unique.slice(0, limit) }];
}

function locationSite(location: SourceLocation): UnusedKeysSite {
  return { file: location.file, line: location.line };
}

function unresolvedOf(
  scan: ProjectScan,
  reason: Exclude<
    UnusedKeysUnreliableReason,
    "dynamic-keys" | "template-files-not-scanned" | "incomplete-scan"
  >,
): readonly UnusedKeysUnreliability[] {
  return unreliability(
    reason,
    scan.usage.unresolved.filter((site) => site.reason === reason).map(locationSite),
  );
}

function unreliableBecause(scan: ProjectScan): readonly UnusedKeysUnreliability[] {
  return [
    ...unreliability("dynamic-keys", scan.usage.dynamic.map(locationSite)),
    ...unresolvedOf(scan, "dynamic-key-prefix"),
    ...unresolvedOf(scan, "trans-without-key"),
    ...unresolvedOf(scan, "aliased-translate-function"),
    ...unreliability(
      "template-files-not-scanned",
      scan.usage.templateFiles.map((file) => ({ file })),
      TEMPLATE_SITE_LIMIT,
    ),
    ...unreliability(
      "incomplete-scan",
      scan.diagnostics.map((entry) => ({ file: entry.file, detail: entry.reason })),
    ),
  ];
}

interface Classified {
  readonly unused: UnusedKey[];
  readonly possiblyDynamic: PossiblyDynamicKey[];
  readonly ignored: UnusedKey[];
}

function classifyKeys(
  scan: ProjectScan,
  catalog: LocaleResource,
  format: FormatId,
  ignorePatterns: readonly string[],
): Classified {
  const referenced = referencedKeys(scan);
  const prefixes = [...new Set(scan.usage.prefixes.map((site) => site.prefix))];
  const classified: Classified = { unused: [], possiblyDynamic: [], ignored: [] };
  for (const catalogKey of catalog.entries.keys()) {
    const forms = catalogKeyForms(format, catalogKey);
    if (forms.lookups.some((lookup) => isReferencedLookup(lookup, referenced))) {
      continue;
    }
    const entry = { key: forms.key, catalogKey };
    const prefix = reachingPrefix(forms, prefixes);
    if (ignorePatterns.some((pattern) => matchesKeyGlob(pattern, forms.key))) {
      classified.ignored.push(entry);
    } else if (prefix !== undefined) {
      classified.possiblyDynamic.push({ ...entry, prefix });
    } else {
      classified.unused.push(entry);
    }
  }
  return classified;
}

function buildReport(
  scan: ProjectScan,
  catalog: LocaleResource,
  input: UnusedKeysInput,
  extraction: ExtractionConfig,
): UnusedKeysScan {
  const reasons = unreliableBecause(scan);
  return {
    status: reasons.length === 0 ? "complete" : "unreliable",
    unreliableBecause: reasons,
    scannedFiles: scan.scannedFiles,
    ...classifyKeys(scan, catalog, input.config.format, extraction.unused?.ignore ?? []),
    dynamicPrefixes: scan.usage.prefixes.map((site) => ({
      prefix: site.prefix,
      file: site.file,
      line: site.line,
    })),
  };
}

function hasNoCandidateFile(scan: ProjectScan): boolean {
  return (
    scan.scannedFiles === 0 &&
    scan.usage.templateFiles.length === 0 &&
    !scan.diagnostics.some((entry) => FILE_DIAGNOSTICS.has(entry.reason))
  );
}

function hasNoReference(scan: ProjectScan, catalog: LocaleResource): boolean {
  const { usage } = scan;
  return (
    scan.scannedFiles > 0 &&
    catalog.entries.size > 0 &&
    referencedKeys(scan).size === 0 &&
    usage.dynamic.length === 0 &&
    usage.prefixes.length === 0 &&
    usage.unresolved.length === 0
  );
}

async function sourceCatalog(input: UnusedKeysInput, deps: UnusedKeysDeps, fs: SdkFs) {
  if (input.sourceCatalog !== undefined) {
    return input.sourceCatalog;
  }
  const adapter = selectAdapter(input.config.format, deps.adapterRegistry, fs);
  return (await readSource(input.config, input.cwd, fs, adapter)).resource;
}

export async function findUnusedKeys(
  input: UnusedKeysInput,
  deps: UnusedKeysDeps = {},
): Promise<UnusedKeysReport> {
  const fs = deps.fs ?? defaultFs;
  const outcome = await scanSource(input, fs, deps.createExtractor);
  if ("status" in outcome) {
    return outcome;
  }
  if (hasNoCandidateFile(outcome.scan)) {
    return notRun(
      "NO_SOURCE_FILES",
      "The extract roots hold no source file, so no key can be judged unused.",
    );
  }
  const catalog = await sourceCatalog(input, deps, fs);
  if (hasNoReference(outcome.scan, catalog)) {
    return notRun(
      "NO_REFERENCES_FOUND",
      "The scanned source files reference no translation key at all, so the scan most likely " +
        "does not cover the code that uses the catalog. Check the extract roots.",
    );
  }
  return buildReport(outcome.scan, catalog, input, outcome.extraction);
}
