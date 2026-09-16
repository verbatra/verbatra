import type { LocaleResource } from "@verbatra/core";
import type { ProjectScan, ScanDiagnostic, SourceLocation } from "@verbatra/extract";
import { type AdapterRegistry, pluralBaseKey } from "@verbatra/format-adapters";
import type { VerbatraConfig } from "../config/schema.js";
import { SdkError, type SdkErrorCode } from "../errors.js";
import { defaultFs, type SdkFs } from "../fs.js";
import { selectAdapter } from "../selection/select-adapter.js";
import { isGeneratedPluralKey } from "./plural-categories.js";
import { readSource } from "./source.js";
import { type CreateExtractor, requireExtractionConfig, runScan } from "./source-scan.js";

/**
 * Why an unused-key report could not be produced at all.
 *
 * - `EXTRACT_NOT_CONFIGURED`: the config carries no `extract` block, so there is no source to scan.
 * - `EXTRACT_FS_UNSUPPORTED`: the supplied file system implements no `readDirectory`.
 * - `NO_SOURCE_FILES`: the scan read no source file under the configured roots.
 */
export type UnusedKeysNotRunReason =
  | "EXTRACT_NOT_CONFIGURED"
  | "EXTRACT_FS_UNSUPPORTED"
  | "NO_SOURCE_FILES";

/**
 * Why a completed scan cannot rule a key unused with confidence.
 *
 * - `dynamic-keys`: at least one call site's key is not a static string (including a
 *   namespace-qualified key), so any catalog key could be the one it reaches.
 * - `indirect-key-sites`: the source names or scopes keys through a construct that is not read as a
 *   call site, such as a `keyPrefix` option, a `Trans` component, or an `i18nKey` attribute.
 * - `incomplete-scan`: a file or directory could not be read to its end.
 */
export type UnusedKeysUnreliableReason = "dynamic-keys" | "indirect-key-sites" | "incomplete-scan";

/** An unused-key report that could not run. It carries no key list, so nothing is misreported. */
export interface UnusedKeysNotRun {
  /** Always `not-run`. */
  readonly status: "not-run";
  /** The stable reason code. Branch on this, not on the message. */
  readonly reason: UnusedKeysNotRunReason;
  /** A human-readable explanation. */
  readonly message: string;
}

/** An unused-key report produced from a source scan. */
export interface UnusedKeysScan {
  /**
   * `complete` when nothing in the scan casts doubt on the verdict; `unreliable` when
   * {@link UnusedKeysScan.unreliableBecause} is not empty, so a listed key may still be in use.
   */
  readonly status: "complete" | "unreliable";
  /** Every reason the verdict cannot be trusted. Empty exactly when `status` is `complete`. */
  readonly unreliableBecause: readonly UnusedKeysUnreliableReason[];
  /** How many source files were read and scanned. */
  readonly scannedFiles: number;
  /** Source-catalog keys no scanned reference names, in catalog order. */
  readonly unused: readonly string[];
  /** Unreferenced source-catalog keys matched by `extract.ignoreUnused`, in catalog order. */
  readonly ignored: readonly string[];
  /** Call sites whose key is not a static string. */
  readonly dynamic: readonly SourceLocation[];
  /** Places that name or scope a key through a construct that is not read as a call site. */
  readonly indirect: readonly SourceLocation[];
  /** Files and directories the scan could not read to their end. */
  readonly diagnostics: readonly ScanDiagnostic[];
}

/**
 * The source-locale catalog keys that nothing in the scanned source references. Distinct from the
 * per-locale `orphaned` lists, which compare a target locale against the source catalog.
 */
export type UnusedKeysReport = UnusedKeysNotRun | UnusedKeysScan;

export interface UnusedKeysInput {
  readonly config: VerbatraConfig;
  readonly cwd: string;
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

const KEY_SEPARATOR = ".";

const VARIANT_SEPARATOR = "_";

function isNotRunError(error: unknown): error is SdkError & { code: UnusedKeysNotRunReason } {
  return error instanceof SdkError && NOT_RUN_ERROR_CODES.has(error.code);
}

interface SourceScan {
  readonly scan: ProjectScan;
  readonly ignorePatterns: readonly string[];
}

async function scanSource(
  input: UnusedKeysInput,
  fs: SdkFs,
  createExtractor: CreateExtractor | undefined,
): Promise<SourceScan | UnusedKeysNotRun> {
  try {
    const extraction = requireExtractionConfig(input.config);
    const scan = await runScan(extraction, input.cwd, fs, createExtractor);
    return { scan, ignorePatterns: extraction.ignoreUnused ?? [] };
  } catch (error) {
    if (isNotRunError(error)) {
      return { status: "not-run", reason: error.code, message: error.message };
    }
    throw error;
  }
}

function referencedKeys(scan: ProjectScan): ReadonlySet<string> {
  const referenced = new Set<string>();
  for (const key of [...scan.keys.map((entry) => entry.key), ...scan.conflicts.map((c) => c.key)]) {
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

function isReferenced(key: string, referenced: ReadonlySet<string>): boolean {
  return (
    referenced.has(key) ||
    isGeneratedPluralKey(key, referenced) ||
    isContextVariantOfReferenced(key, referenced) ||
    isUnderReferencedParent(key, referenced)
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function ignoreMatcher(patterns: readonly string[]): (key: string) => boolean {
  const expressions = patterns.map(
    (pattern) => new RegExp(`^${pattern.split("*").map(escapeRegExp).join(".*")}$`, "s"),
  );
  return (key) => expressions.some((expression) => expression.test(key));
}

function unreliableReasons(scan: ProjectScan): readonly UnusedKeysUnreliableReason[] {
  const reasons: UnusedKeysUnreliableReason[] = [];
  if (scan.dynamic.length > 0) {
    reasons.push("dynamic-keys");
  }
  if (scan.indirect.length > 0) {
    reasons.push("indirect-key-sites");
  }
  if (scan.diagnostics.length > 0) {
    reasons.push("incomplete-scan");
  }
  return reasons;
}

function buildReport(
  scan: ProjectScan,
  catalog: LocaleResource,
  ignorePatterns: readonly string[],
): UnusedKeysScan {
  const referenced = referencedKeys(scan);
  const isIgnored = ignoreMatcher(ignorePatterns);
  const unreferenced = [...catalog.entries.keys()].filter((key) => !isReferenced(key, referenced));
  const reasons = unreliableReasons(scan);
  return {
    status: reasons.length === 0 ? "complete" : "unreliable",
    unreliableBecause: reasons,
    scannedFiles: scan.scannedFiles,
    unused: unreferenced.filter((key) => !isIgnored(key)),
    ignored: unreferenced.filter(isIgnored),
    dynamic: scan.dynamic,
    indirect: scan.indirect,
    diagnostics: scan.diagnostics,
  };
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
  if (outcome.scan.scannedFiles === 0) {
    return {
      status: "not-run",
      reason: "NO_SOURCE_FILES",
      message:
        "The source scan read no file under the configured extract roots, so no key can be judged unused.",
    };
  }
  const adapter = selectAdapter(input.config.format, deps.adapterRegistry, deps.fs);
  const { resource } = await readSource(input.config, input.cwd, fs, adapter);
  return buildReport(outcome.scan, resource, outcome.ignorePatterns);
}
