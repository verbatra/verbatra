import type { LocaleResource } from "@verbatra/core";
import { SdkError } from "../errors.js";
import type { SdkFs } from "../fs.js";
import {
  localeRecords,
  type ProvenanceFile,
  type ProvenanceOrigin,
  type ProvenanceRecord,
  provenanceFilePath,
  readProvenanceFile,
  valueHash,
} from "./provenance-file.js";

/**
 * A key's origin as a reader should interpret it: a stored {@link ProvenanceOrigin}, or one of two
 * states derived from the files rather than stored.
 *
 * - `unrecorded`: the key has a value but no record, for example a value written before the
 *   provenance file existed.
 * - `external`: a record exists but describes a different value, so something outside verbatra's
 *   write paths changed the value since: a hand edit, an older verbatra, or a merge.
 */
export type KeyOrigin = ProvenanceOrigin | "unrecorded" | "external";

/** A key's review state as a reader should interpret it. */
export type KeyReviewState = "unreviewed" | "approved" | "rejected";

/**
 * The origins whose values a person is asked to review: every write path a person did not write
 * through. `memory` counts because the translation memory records no author, so an exact hit can
 * be a provider's answer; `agent` counts because an AI agent's edit still needs a person's review.
 */
export type MachineClassOrigin = "machine" | "memory" | "fuzzy" | "agent";

/**
 * Every {@link MachineClassOrigin}, in the order reports list them. A value with one of these
 * origins that is not approved is in the review queue (see {@link reviewQueue}) and fails
 * `check --require-reviewed` (see {@link CheckInput.requireReviewed}).
 */
export const MACHINE_CLASS_ORIGINS: readonly MachineClassOrigin[] = Object.freeze([
  "machine",
  "memory",
  "fuzzy",
  "agent",
]);

const MACHINE_CLASS: ReadonlySet<KeyOrigin> = new Set<KeyOrigin>(MACHINE_CLASS_ORIGINS);

export function isMachineClassOrigin(origin: KeyOrigin): origin is MachineClassOrigin {
  return MACHINE_CLASS.has(origin);
}

/** The interpreted provenance of one key's current value in one locale. */
export interface KeyProvenance {
  /** Which write path produced the current value, or why that is not known. */
  readonly origin: KeyOrigin;
  /** The `id` of the provider that answered, for a `machine` value. */
  readonly provider?: string;
  /**
   * The configured model, for a `machine` value from the configured provider when it has one.
   * Absent when a custom `createProvider` answered under a different `id`.
   */
  readonly model?: string;
  /** Whether the current value was reviewed. Always `unreviewed` for `unrecorded` and `external`. */
  readonly reviewState: KeyReviewState;
  /** The reviewer named when the review decision was recorded, if one was. */
  readonly reviewer?: string;
}

/**
 * Per-locale counts of {@link KeyProvenance}, over the keys that have a value in both the source and
 * the target locale.
 */
export interface ProvenanceSummary {
  /** How many keys have each origin. Every {@link KeyOrigin} is present, zero included. */
  readonly byOrigin: Readonly<Record<KeyOrigin, number>>;
  /** How many keys are in each review state. Every {@link KeyReviewState} is present. */
  readonly byReviewState: Readonly<Record<KeyReviewState, number>>;
}

const STORED_ORIGINS: ReadonlySet<string> = new Set<ProvenanceOrigin>([
  "machine",
  "memory",
  "fuzzy",
  "agent",
  "human",
  "import",
  "unknown",
]);

const UNRECORDED: KeyProvenance = { origin: "unrecorded", reviewState: "unreviewed" };
const EXTERNAL: KeyProvenance = { origin: "external", reviewState: "unreviewed" };

function storedOrigin(origin: string): ProvenanceOrigin {
  return STORED_ORIGINS.has(origin) ? (origin as ProvenanceOrigin) : "unknown";
}

function reviewStateOf(record: ProvenanceRecord, sourceHash: string | undefined): KeyReviewState {
  const state = record.reviewState;
  if (state === "rejected") {
    return state;
  }
  if (state !== "approved") {
    return "unreviewed";
  }
  const reviewedAgainst = record.reviewedSourceHash;
  return reviewedAgainst === undefined || sourceHash === undefined || reviewedAgainst === sourceHash
    ? "approved"
    : "unreviewed";
}

export function keyProvenance(
  record: ProvenanceRecord | undefined,
  value: string,
  sourceHash?: string,
): KeyProvenance {
  if (record === undefined) {
    return UNRECORDED;
  }
  if (record.valueHash !== valueHash(value)) {
    return EXTERNAL;
  }
  const reviewState = reviewStateOf(record, sourceHash);
  return {
    origin: storedOrigin(record.origin),
    ...(record.provider !== undefined ? { provider: record.provider } : {}),
    ...(record.model !== undefined ? { model: record.model } : {}),
    reviewState,
    ...(record.reviewer !== undefined && reviewState !== "unreviewed"
      ? { reviewer: record.reviewer }
      : {}),
  };
}

function emptyProvenanceSummary(): {
  byOrigin: Record<KeyOrigin, number>;
  byReviewState: Record<KeyReviewState, number>;
} {
  return {
    byOrigin: {
      machine: 0,
      memory: 0,
      fuzzy: 0,
      agent: 0,
      human: 0,
      import: 0,
      unknown: 0,
      unrecorded: 0,
      external: 0,
    },
    byReviewState: { unreviewed: 0, approved: 0, rejected: 0 },
  };
}

export type LocaleProvenance = (locale: string) => ReadonlyMap<string, ProvenanceRecord>;

export async function readReportableProvenance(
  cwd: string,
  fs: SdkFs,
): Promise<ProvenanceFile | undefined> {
  let read: Awaited<ReturnType<typeof readProvenanceFile>>;
  try {
    read = await readProvenanceFile(provenanceFilePath(cwd), fs);
  } catch (error) {
    if (error instanceof SdkError && error.code === "PROVENANCE_FILE_INVALID") {
      return undefined;
    }
    throw error;
  }
  return read.writable ? read.file : undefined;
}

export function provenanceOf(file: ProvenanceFile): LocaleProvenance {
  return (locale) => localeRecords(file, locale);
}

export async function readLocaleProvenance(
  cwd: string,
  fs: SdkFs,
): Promise<LocaleProvenance | undefined> {
  const file = await readReportableProvenance(cwd, fs);
  return file === undefined ? undefined : provenanceOf(file);
}

function* translatedValues(
  source: LocaleResource,
  target: LocaleResource,
): Generator<readonly [string, string]> {
  for (const [key, entry] of target.entries) {
    if (source.entries.has(key)) {
      yield [key, entry.value];
    }
  }
}

export function originsOf(
  records: ReadonlyMap<string, ProvenanceRecord>,
  target: LocaleResource,
  keys: readonly string[],
): Record<string, KeyOrigin> {
  const origins: [string, KeyOrigin][] = [];
  for (const key of keys) {
    const entry = target.entries.get(key);
    if (entry !== undefined) {
      origins.push([key, keyProvenance(records.get(key), entry.value).origin]);
    }
  }
  return Object.fromEntries(origins);
}

export function summarizeProvenance(
  records: ReadonlyMap<string, ProvenanceRecord>,
  source: LocaleResource,
  target: LocaleResource,
): ProvenanceSummary {
  const summary = emptyProvenanceSummary();
  for (const [key, value] of translatedValues(source, target)) {
    const provenance = keyProvenance(records.get(key), value);
    summary.byOrigin[provenance.origin] += 1;
    summary.byReviewState[provenance.reviewState] += 1;
  }
  return summary;
}
