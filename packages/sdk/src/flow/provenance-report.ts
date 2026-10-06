import type { AdapterRegistry } from "@verbatra/format-adapters";
import type { VerbatraConfig } from "../config/schema.js";
import type { SdkFs } from "../fs.js";
import {
  isMachineClassOrigin,
  type KeyOrigin,
  type KeyProvenance,
  type KeyReviewState,
  keyProvenance,
} from "../lock/key-provenance.js";
import type { ProvenanceRecord } from "../lock/provenance-file.js";
import { diffLocalesWithSource, type LocaleDiffResult } from "./diff-locales.js";

/**
 * The bucket a {@link provenanceReport} puts a value in:
 *
 * - `machine-unreviewed`: a machine-class origin (see {@link MACHINE_CLASS_ORIGINS}) and not
 *   approved, including a rejected value that is back in the file.
 * - `machine-reviewed`: a machine-class origin a person approved.
 * - `human`: written by a person through verbatra.
 * - `import`: read from a translator handoff.
 * - `external`: changed outside verbatra's write paths since its record was written.
 * - `unrecorded`: no record, for example a value written before the provenance file existed.
 * - `unknown`: recorded without a known author, or with an origin this release does not know.
 */
export type ProvenanceBucket = (typeof PROVENANCE_BUCKETS)[number];

/** Every {@link ProvenanceBucket}, in the order reports list them. */
export const PROVENANCE_BUCKETS = Object.freeze([
  "machine-unreviewed",
  "machine-reviewed",
  "human",
  "import",
  "external",
  "unrecorded",
  "unknown",
] as const);

/** Input for {@link provenanceReport}. */
export interface ProvenanceReportInput {
  /** The resolved project config, normally from {@link loadConfig}. */
  readonly config: VerbatraConfig;
  /** Directory the `files.pattern` is resolved against. Defaults to the project root of the config object {@link loadConfig} returned, else the process working directory; a copied or rebuilt config loses that root, so pass `cwd` from {@link resolveProjectRoot}. */
  readonly cwd?: string;
  /** Restrict the report to these target locales. Defaults to every configured target locale. */
  readonly locales?: readonly string[];
  /**
   * The verbatra version to stamp on the report, as {@link ProvenanceReport.toolVersion}. Defaults
   * to `unknown`.
   */
  readonly toolVersion?: string;
}

/** Injectable dependencies for {@link provenanceReport}. Every field has a working default. */
export interface ProvenanceReportDeps {
  /** Format-adapter registry to resolve the configured format. Defaults to the built-in registry. */
  readonly adapterRegistry?: AdapterRegistry;
  /** File-system port. Defaults to the real file system. */
  readonly fs?: SdkFs;
  /** The clock {@link ProvenanceReport.generatedAt} is read from. Defaults to the system clock. */
  readonly now?: () => Date;
}

/** One key's current value in a {@link ProvenanceReportLocale}. */
export interface ProvenanceReportEntry {
  /** The translation key. */
  readonly key: string;
  /** The bucket the value is counted in. */
  readonly bucket: ProvenanceBucket;
  /** Which write path produced the value, or why that is not known. */
  readonly origin: KeyOrigin;
  /**
   * Whether a person reviewed the value. An approval given against a source text that has changed
   * since reads as `unreviewed`.
   */
  readonly reviewState: KeyReviewState;
  /** The `id` of the provider that answered, for a `machine` value. */
  readonly provider?: string;
  /** The configured model, for a `machine` value when the record names one. */
  readonly model?: string;
  /** The reviewer named when the review decision was recorded, if one was. */
  readonly reviewer?: string;
}

/** One target locale's part of a {@link ProvenanceReport}. */
export interface ProvenanceReportLocale {
  /** The target locale. */
  readonly locale: string;
  /** How many values the locale holds: the length of {@link ProvenanceReportLocale.entries}. */
  readonly total: number;
  /** How many values are in each bucket. Every {@link ProvenanceBucket} is present, zero included. */
  readonly counts: Readonly<Record<ProvenanceBucket, number>>;
  /**
   * One entry per key that has a value in both the source and this locale, in source order. Keys
   * missing from the locale and keys no longer in the source are not listed.
   */
  readonly entries: readonly ProvenanceReportEntry[];
}

/** A report {@link provenanceReport} could build. */
export interface ProvenanceReport {
  /** The report was built from the committed files. */
  readonly available: true;
  /** When the report was generated, as an ISO 8601 timestamp. */
  readonly generatedAt: string;
  /** The verbatra version that generated it, or `unknown`. */
  readonly toolVersion: string;
  /** The configured source locale. */
  readonly sourceLocale: string;
  /** One entry per requested target locale, in configured order. */
  readonly locales: readonly ProvenanceReportLocale[];
}

/**
 * The result of {@link provenanceReport}. It is `available: false` only when the provenance file
 * cannot be read, since the report is built from it.
 */
export type ProvenanceReportResult =
  | ProvenanceReport
  | {
      /** The provenance file is corrupt or was written by a newer verbatra, so no report exists. */
      readonly available: false;
      /** Why the report could not be built. */
      readonly reason: "provenance-unreadable";
    };

const UNKNOWN_TOOL_VERSION = "unknown";

function bucketOf(provenance: KeyProvenance): ProvenanceBucket {
  if (isMachineClassOrigin(provenance.origin)) {
    return provenance.reviewState === "approved" ? "machine-reviewed" : "machine-unreviewed";
  }
  return provenance.origin;
}

function emptyCounts(): Record<ProvenanceBucket, number> {
  return {
    "machine-unreviewed": 0,
    "machine-reviewed": 0,
    human: 0,
    import: 0,
    external: 0,
    unrecorded: 0,
    unknown: 0,
  };
}

function entryOf(key: string, provenance: KeyProvenance): ProvenanceReportEntry {
  return { key, bucket: bucketOf(provenance), ...provenance };
}

function reportLocale(
  result: LocaleDiffResult,
  records: ReadonlyMap<string, ProvenanceRecord>,
): ProvenanceReportLocale {
  const counts = emptyCounts();
  const entries: ProvenanceReportEntry[] = [];
  for (const key of result.source.entries.keys()) {
    const value = result.target.entries.get(key)?.value;
    if (value === undefined) {
      continue;
    }
    const entry = entryOf(key, keyProvenance(records.get(key), value, result.baseline.get(key)));
    counts[entry.bucket] += 1;
    entries.push(entry);
  }
  return { locale: result.locale, total: entries.length, counts, entries };
}

/**
 * Builds a per-locale report of where each translation came from and whether a person reviewed
 * it, for an audit file or as supporting evidence of which published text was machine-generated.
 * It is read-only: it calls no provider, needs no API key, and writes nothing.
 *
 * Every key with a value in both the source and a target locale is listed with its origin, review
 * state, provider, model and reviewer as `verbatra.provenance.json` records them, and counted in
 * one {@link ProvenanceBucket}. The record holds no timestamps, so the report carries none per
 * key; the git history of `verbatra.provenance.json` says when each decision was committed.
 *
 * The record states which verbatra write path produced a value; it is not tamper-evident, and
 * anyone who can edit the locale files can edit it. The report is supporting evidence, not legal
 * advice and not an attestation of compliance with any regulation.
 *
 * @param input - The config, the optional locale filter, and the version to stamp.
 * @param deps - Optional adapter registry, file-system and clock overrides.
 * @returns The report, or `available: false` when the provenance file is corrupt or from a newer
 * verbatra: a report built without it would list every value as `unrecorded`.
 *
 * @throws {@link SdkError} `UNKNOWN_FORMAT`: no adapter is registered for the configured format.
 * @throws {@link SdkError} `UNKNOWN_LOCALE`: a requested locale is not a configured target locale.
 * @throws {@link SdkError} `LOCALE_LAYOUT_INVALID`: the `files.pattern` and `files.localeStyle`
 * cannot be combined, or a configured locale has no valid path spelling under that style.
 * @throws {@link SdkError} `LOCALE_PATH_COLLISION`: two configured locales resolve to the same path.
 * @throws {@link SdkError} `SOURCE_UNREADABLE`: the source locale file does not exist.
 * @throws {@link SdkError} `SOURCE_INVALID`: the source locale file could not be parsed.
 * @throws {@link SdkError} `LOCK_FILE_INVALID`: the lock-file is corrupt, oversized, or at an
 * unsupported version.
 * @throws `AdapterError`: a target locale file is malformed. Its own code is preserved.
 *
 * @example
 * ```ts
 * const report = await provenanceReport({ config, toolVersion: "1.2.3" });
 * if (report.available) {
 *   for (const locale of report.locales) {
 *     console.log(locale.locale, locale.counts["machine-unreviewed"]);
 *   }
 * }
 * ```
 */
export async function provenanceReport(
  input: ProvenanceReportInput,
  deps: ProvenanceReportDeps = {},
): Promise<ProvenanceReportResult> {
  const { results } = await diffLocalesWithSource(
    {
      config: input.config,
      ...(input.cwd !== undefined ? { cwd: input.cwd } : {}),
      ...(input.locales !== undefined ? { locales: input.locales } : {}),
    },
    {
      ...(deps.adapterRegistry !== undefined ? { adapterRegistry: deps.adapterRegistry } : {}),
      ...(deps.fs !== undefined ? { fs: deps.fs } : {}),
    },
  );
  const locales: ProvenanceReportLocale[] = [];
  for (const result of results) {
    if (result.provenance === undefined) {
      return { available: false, reason: "provenance-unreadable" };
    }
    locales.push(reportLocale(result, result.provenance));
  }
  return {
    available: true,
    generatedAt: (deps.now ?? (() => new Date()))().toISOString(),
    toolVersion: input.toolVersion ?? UNKNOWN_TOOL_VERSION,
    sourceLocale: input.config.sourceLocale,
    locales,
  };
}
