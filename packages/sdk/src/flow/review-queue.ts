import type { LocaleResource } from "@verbatra/core";
import type { AdapterRegistry } from "@verbatra/format-adapters";
import type { VerbatraConfig } from "../config/schema.js";
import { defaultFs, type SdkFs } from "../fs.js";
import {
  type KeyProvenance,
  keyProvenance,
  type LocaleProvenance,
  readLocaleProvenance,
} from "../lock/key-provenance.js";
import { baselineFor, lockFilePath, readLockFile } from "../lock/lock-file.js";
import type { LockFile } from "../lock/types.js";
import type { RunStatusFile, RunStatusLocale } from "../run-status/types.js";
import { selectAdapter } from "../selection/select-adapter.js";
import { readTarget } from "./diff-locales.js";
import { runStatus } from "./run-status.js";
import type { NeedsReviewEntry } from "./summary.js";

/** Input for {@link reviewQueue}. */
export interface ReviewQueueInput {
  /** The resolved project config, normally from {@link loadConfig}. */
  readonly config: VerbatraConfig;
  /** Directory the `files.pattern` is resolved against. Defaults to the process working directory. */
  readonly cwd?: string;
}

/** Injectable dependencies for {@link reviewQueue}. Every field has a working default. */
export interface ReviewQueueDeps {
  /** Format-adapter registry to resolve the configured format. Defaults to the built-in registry. */
  readonly adapterRegistry?: AdapterRegistry;
  /** File-system port. Defaults to the real file system. */
  readonly fs?: SdkFs;
}

/** One key still waiting for a review decision. */
export interface ReviewQueueEntry extends NeedsReviewEntry {
  /**
   * The provenance of the key's current translation. Absent when the provenance file could not be
   * read, in which case no entry was filtered on it.
   */
  readonly provenance?: KeyProvenance;
}

/** One locale's part of a {@link ReviewQueueResult}. */
export interface ReviewQueueLocale extends Omit<RunStatusLocale, "needsReview"> {
  /** Keys the recorded run flagged that nobody has approved, rejected, or rewritten since. */
  readonly needsReview: readonly ReviewQueueEntry[];
}

/**
 * The result of {@link reviewQueue}: the persisted run status of {@link runStatus}, with every
 * locale's flagged keys narrowed to the ones still waiting for a decision.
 */
export type ReviewQueueResult =
  | {
      /** No usable status file was found, so there is nothing to review. */
      readonly available: false;
    }
  | ({
      /** A status file was found; its fields are spread alongside, with the narrowed locales. */
      readonly available: true;
      /** Per-locale outcomes from the recorded run, narrowed to undecided keys. */
      readonly locales: readonly ReviewQueueLocale[];
    } & Omit<RunStatusFile, "locales">);

const WRITTEN_BY_A_PERSON: ReadonlySet<string> = new Set(["human", "import"]);

interface QueueState {
  readonly provenance: LocaleProvenance | undefined;
  readonly lock: LockFile | undefined;
  readonly readTarget: (locale: string) => Promise<LocaleResource | undefined>;
}

async function readLockOrUndefined(cwd: string, fs: SdkFs): Promise<LockFile | undefined> {
  try {
    return await readLockFile(lockFilePath(cwd), fs);
  } catch {
    return undefined;
  }
}

async function readProvenanceOrUndefined(
  cwd: string,
  fs: SdkFs,
): Promise<LocaleProvenance | undefined> {
  try {
    return await readLocaleProvenance(cwd, fs);
  } catch {
    return undefined;
  }
}

function isUndecided(provenance: KeyProvenance): boolean {
  return provenance.reviewState === "unreviewed" && !WRITTEN_BY_A_PERSON.has(provenance.origin);
}

function narrowEntries(
  entries: readonly NeedsReviewEntry[],
  target: LocaleResource,
  locale: string,
  state: QueueState,
): ReviewQueueEntry[] {
  const records = state.provenance?.(locale);
  const baseline = state.lock === undefined ? undefined : baselineFor(state.lock, locale);
  const kept: ReviewQueueEntry[] = [];
  for (const entry of entries) {
    const current = target.entries.get(entry.key);
    if (current === undefined) {
      continue;
    }
    if (records === undefined) {
      kept.push(entry);
      continue;
    }
    const provenance = keyProvenance(
      records.get(entry.key),
      current.value,
      baseline?.get(entry.key),
    );
    if (isUndecided(provenance)) {
      kept.push({ ...entry, provenance });
    }
  }
  return kept;
}

async function narrowLocale(
  locale: RunStatusLocale,
  state: QueueState,
): Promise<ReviewQueueLocale> {
  const target = await state.readTarget(locale.locale);
  if (target === undefined) {
    return locale;
  }
  const needsReview = narrowEntries(locale.needsReview, target, locale.locale, state);
  const remaining = new Set(needsReview.map((entry) => entry.key));
  const { fuzzyHits, ...rest } = locale;
  const keptHits = fuzzyHits?.filter((hit) => remaining.has(hit.key));
  return {
    ...rest,
    needsReview,
    ...(keptHits !== undefined && keptHits.length > 0 ? { fuzzyHits: keptHits } : {}),
  };
}

function targetReader(
  input: ReviewQueueInput,
  cwd: string,
  fs: SdkFs,
  deps: ReviewQueueDeps,
): (locale: string) => Promise<LocaleResource | undefined> {
  const configured = new Set(input.config.targetLocales);
  return async (locale) => {
    if (!configured.has(locale)) {
      return undefined;
    }
    try {
      const adapter = selectAdapter(input.config.format, deps.adapterRegistry, deps.fs);
      return await readTarget(cwd, input.config, adapter, fs, locale);
    } catch {
      return undefined;
    }
  };
}

/**
 * Reads the review queue: the keys the last non-dry-run {@link translate} or {@link watch} flagged
 * for review (see {@link runStatus}), minus every key that has been dealt with since. It writes
 * nothing and calls no provider.
 *
 * A flagged key leaves the queue once its current translation is approved or rejected in the
 * provenance file (see {@link approveEntry} and {@link rejectEntry}), once a person wrote or
 * imported a new value for it, or once it has no translation any more. Because those decisions
 * are read from committed files, a teammate with the same run status sees the same queue. Each
 * remaining entry carries the provenance of its current translation.
 *
 * Like {@link runStatus}, the read is total and throws nothing. A missing or unusable status file
 * reports `available: false`. A provenance file that cannot be read leaves the flags unnarrowed by
 * review state and without provenance, and a locale whose file cannot be read, or that is no
 * longer configured, keeps its flags as recorded.
 *
 * @param input - The config and the optional working directory.
 * @param deps - Optional adapter registry and file-system overrides.
 * @returns The queue of undecided flags, or `available: false` when no run status is usable.
 */
export async function reviewQueue(
  input: ReviewQueueInput,
  deps: ReviewQueueDeps = {},
): Promise<ReviewQueueResult> {
  const cwd = input.cwd ?? process.cwd();
  const fs = deps.fs ?? defaultFs;
  const status = await runStatus({ cwd }, { fs });
  if (!status.available) {
    return status;
  }
  const state: QueueState = {
    provenance: await readProvenanceOrUndefined(cwd, fs),
    lock: await readLockOrUndefined(cwd, fs),
    readTarget: targetReader(input, cwd, fs, deps),
  };
  const locales: ReviewQueueLocale[] = [];
  for (const locale of status.locales) {
    locales.push(await narrowLocale(locale, state));
  }
  return { ...status, locales };
}
