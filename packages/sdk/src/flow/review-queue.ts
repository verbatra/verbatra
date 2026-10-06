import type { ReviewReasonCode } from "@verbatra/ai-providers";
import type { AdapterRegistry } from "@verbatra/format-adapters";
import { projectCwd } from "../config/project-root.js";
import type { VerbatraConfig } from "../config/schema.js";
import { defaultFs, type SdkFs } from "../fs.js";
import type { KeyProvenance, MachineClassOrigin } from "../lock/key-provenance.js";
import type { RunStatusLocale } from "../run-status/types.js";
import { diffLocalesWithSource, type LocaleDiffResult } from "./diff-locales.js";
import { type MachineClassValue, machineClassValues } from "./review-scan.js";
import { runStatus } from "./run-status.js";
import type { FuzzyCacheHit, NeedsReviewEntry } from "./summary.js";

/** Input for {@link reviewQueue}. */
export interface ReviewQueueInput {
  /** The resolved project config, normally from {@link loadConfig}. */
  readonly config: VerbatraConfig;
  /** Directory the `files.pattern` is resolved against. Defaults to the project root of a config that {@link loadConfig} returned, else the process working directory. */
  readonly cwd?: string;
  /** Restrict the queue to these target locales. Defaults to every configured target locale. */
  readonly locales?: readonly string[];
  /**
   * Also list, per locale, the machine-class values already approved (see
   * {@link ReviewQueueLocale.approved}), for a reviewer who wants to revisit them. Defaults to
   * false.
   */
  readonly includeApproved?: boolean;
}

/** Injectable dependencies for {@link reviewQueue}. Every field has a working default. */
export interface ReviewQueueDeps {
  /** Format-adapter registry to resolve the configured format. Defaults to the built-in registry. */
  readonly adapterRegistry?: AdapterRegistry;
  /** File-system port. Defaults to the real file system. */
  readonly fs?: SdkFs;
}

/** One machine-class value in the review queue. */
export interface ReviewQueueEntry extends NeedsReviewEntry {
  /**
   * The review reasons the last recorded {@link translate} or {@link watch} run flagged the key
   * with, from `.verbatra-local/run-status.json`. Empty when that run did not flag the key, flagged
   * it only with reasons this version does not know (written by a newer verbatra), or no run status
   * is available on this machine: the entry is in the queue because nobody approved its value, not
   * because of a flag.
   */
  readonly reasons: readonly ReviewReasonCode[];
  /** The provenance of the key's current value. Its origin is always a {@link MachineClassOrigin}. */
  readonly provenance: KeyProvenance & { readonly origin: MachineClassOrigin };
}

/** One target locale's part of a {@link ReviewQueueResult}. */
export interface ReviewQueueLocale {
  /** The target locale. */
  readonly locale: string;
  /**
   * Every key whose current value has a {@link MachineClassOrigin} and is unreviewed, in source
   * order. An approval given against a source text that has changed since reads as unreviewed.
   */
  readonly needsReview: readonly ReviewQueueEntry[];
  /**
   * Every key whose current value has a {@link MachineClassOrigin} and is approved, in source
   * order. Present only when {@link ReviewQueueInput.includeApproved} is true.
   */
  readonly approved?: readonly ReviewQueueEntry[];
  /**
   * The evidence the last recorded run kept for each fuzzy translation-memory reuse among the
   * entries in {@link ReviewQueueLocale.needsReview}. Absent when there is none.
   */
  readonly fuzzyHits?: readonly FuzzyCacheHit[];
}

/**
 * The result of {@link reviewQueue}. It is `available: false` only when the provenance file cannot
 * be read, since the queue is built from it.
 */
export type ReviewQueueResult =
  | {
      /** The provenance file is corrupt or was written by a newer verbatra, so no queue exists. */
      readonly available: false;
      /** Why the queue could not be built. */
      readonly reason: "provenance-unreadable";
    }
  | {
      /** The queue was built from the committed files. */
      readonly available: true;
      /** One entry per requested target locale, in configured order. */
      readonly locales: readonly ReviewQueueLocale[];
      /**
       * When the last recorded run on this machine finished, as an ISO 8601 timestamp: the run the
       * entries' `reasons` and the `fuzzyHits` come from. Absent when no run status is available.
       */
      readonly lastRunAt?: string;
    };

interface RunFlags {
  readonly reasons: ReadonlyMap<string, readonly ReviewReasonCode[]>;
  readonly fuzzyHits: readonly FuzzyCacheHit[];
}

const NO_FLAGS: RunFlags = { reasons: new Map(), fuzzyHits: [] };

function flagsOf(locale: RunStatusLocale): RunFlags {
  return {
    reasons: new Map(locale.needsReview.map((entry) => [entry.key, entry.reasons])),
    fuzzyHits: locale.fuzzyHits ?? [],
  };
}

function toEntry(value: MachineClassValue, flags: RunFlags): ReviewQueueEntry {
  return {
    key: value.key,
    reasons: flags.reasons.get(value.key) ?? [],
    provenance: value.provenance,
  };
}

function queueLocale(
  result: LocaleDiffResult,
  records: NonNullable<LocaleDiffResult["provenance"]>,
  flags: RunFlags,
  includeApproved: boolean,
): ReviewQueueLocale {
  const values = machineClassValues(result, records);
  const needsReview = values
    .filter((value) => value.provenance.reviewState === "unreviewed")
    .map((value) => toEntry(value, flags));
  const queued = new Set(needsReview.map((entry) => entry.key));
  const fuzzyHits = flags.fuzzyHits.filter((hit) => queued.has(hit.key));
  return {
    locale: result.locale,
    needsReview,
    ...(includeApproved
      ? {
          approved: values
            .filter((value) => value.provenance.reviewState === "approved")
            .map((value) => toEntry(value, flags)),
        }
      : {}),
    ...(fuzzyHits.length > 0 ? { fuzzyHits } : {}),
  };
}

async function runFlags(
  cwd: string,
  fs: SdkFs,
): Promise<{
  readonly byLocale: ReadonlyMap<string, RunFlags>;
  readonly lastRunAt?: string;
}> {
  const status = await runStatus({ cwd }, { fs });
  if (!status.available) {
    return { byLocale: new Map() };
  }
  return {
    byLocale: new Map(status.locales.map((locale) => [locale.locale, flagsOf(locale)])),
    lastRunAt: status.generatedAt,
  };
}

/**
 * Reads the review queue from the committed files: every key whose current value was written by a
 * machine-class path (a provider, the translation memory, a fuzzy match, or an AI agent; see
 * {@link MACHINE_CLASS_ORIGINS}) and that nobody has approved yet. It writes nothing and calls no
 * provider.
 *
 * The queue is computed from the locale files, `verbatra.lock.json`, and
 * `verbatra.provenance.json`, so every teammate and every CI job that has the same commit sees the
 * same queue. A key leaves it once its value is approved or rejected (see {@link approveEntry},
 * {@link approveLocale}, and {@link rejectEntry}), or once a person writes or imports a new value.
 * A later write that changes an approved value, including a hand edit of the locale file, which
 * reads as the origin `external`, drops the approval: a machine write puts the key back in the
 * queue, a person's write leaves it out. Keys missing from the target locale and keys no longer in
 * the source are never listed.
 *
 * The last recorded run's review flags (`.verbatra-local/run-status.json`, local to this machine)
 * only add detail: each entry carries the reasons that run flagged it with, and each locale the
 * fuzzy-match evidence for its entries.
 *
 * @param input - The config, the optional locale filter, and whether to list approved values too.
 * @param deps - Optional adapter registry and file-system overrides.
 * @returns The queue per locale, or `available: false` when the provenance file cannot be read.
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
 */
export async function reviewQueue(
  input: ReviewQueueInput,
  deps: ReviewQueueDeps = {},
): Promise<ReviewQueueResult> {
  const cwd = projectCwd(input);
  const fs = deps.fs ?? defaultFs;
  const { results } = await diffLocalesWithSource(
    {
      config: input.config,
      cwd,
      ...(input.locales !== undefined ? { locales: input.locales } : {}),
    },
    deps,
  );
  const locales: ReviewQueueLocale[] = [];
  const flags = await runFlags(cwd, fs);
  for (const result of results) {
    if (result.provenance === undefined) {
      return { available: false, reason: "provenance-unreadable" };
    }
    locales.push(
      queueLocale(
        result,
        result.provenance,
        flags.byLocale.get(result.locale) ?? NO_FLAGS,
        input.includeApproved === true,
      ),
    );
  }
  return {
    available: true,
    locales,
    ...(flags.lastRunAt !== undefined ? { lastRunAt: flags.lastRunAt } : {}),
  };
}
