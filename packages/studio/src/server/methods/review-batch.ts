import {
  approveEntries,
  type BatchEntry,
  type BatchEntryFailure,
  BatchInterruptedError,
  type RetranslateBatchOutcome,
  type ReviewBatchOutcome,
  redact,
  rejectEntries,
  retranslateEntries,
} from "@verbatra/sdk";
import { uniqueByIdentity } from "../../shared/rpc/entry-identity.js";
import { RETRANSLATE_ENTRIES_METHOD } from "../../shared/rpc/retranslate-entries.js";
import {
  REVIEW_APPROVE_MANY_METHOD,
  REVIEW_REJECT_MANY_METHOD,
} from "../../shared/rpc/review-batch.js";
import type { RpcHandler, RpcHandlerDeps } from "../rpc.js";

export const STUDIO_BATCH_LOCK_TIMEOUT_MS = 30_000;

function reviewDeps(deps: RpcHandlerDeps) {
  return {
    ...(deps.fs !== undefined ? { fs: deps.fs } : {}),
    ...(deps.adapterRegistry !== undefined ? { adapterRegistry: deps.adapterRegistry } : {}),
  };
}

const BATCH_INTERRUPTED_MESSAGE =
  "The batch stopped before this entry because of an unexpected server error.";

const CONTROL_CHARACTERS = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu;

function causeText(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

export function interruptionLogLine(method: string, error: BatchInterruptedError): string {
  const line =
    `studio error: ${method} stopped at ${JSON.stringify(error.entry.key)} in ` +
    `${error.entry.locale} after ${error.results.length} completed: ${causeText(error.cause)}`;
  return redact(line).replace(CONTROL_CHARACTERS, " ");
}

function interruptedOutcomes(
  entries: readonly BatchEntry[],
  error: BatchInterruptedError,
): BatchEntryFailure[] {
  return entries.slice(error.results.length).map((entry) => ({
    locale: entry.locale,
    key: entry.key,
    ok: false,
    code: "BATCH_INTERRUPTED",
    message: BATCH_INTERRUPTED_MESSAGE,
  }));
}

async function surfacingInterruption<R>(
  method: string,
  entries: readonly BatchEntry[],
  deps: RpcHandlerDeps,
  run: () => Promise<{ readonly results: readonly R[] }>,
): Promise<{ readonly results: readonly (R | BatchEntryFailure)[] }> {
  try {
    return await run();
  } catch (error) {
    if (!(error instanceof BatchInterruptedError)) {
      throw error;
    }
    deps.log?.(interruptionLogLine(method, error));
    const completed = error.results as readonly R[];
    return { results: [...completed, ...interruptedOutcomes(entries, error)] };
  }
}

export const reviewApproveManyHandler: RpcHandler<"review.approveMany"> = async (params, deps) => {
  const entries = uniqueByIdentity(params.entries);
  return surfacingInterruption<ReviewBatchOutcome>(REVIEW_APPROVE_MANY_METHOD, entries, deps, () =>
    approveEntries(
      { config: deps.config.config, cwd: deps.projectRoot, entries },
      reviewDeps(deps),
    ),
  );
};

export const reviewRejectManyHandler: RpcHandler<"review.rejectMany"> = async (params, deps) => {
  const entries = uniqueByIdentity(params.entries);
  return surfacingInterruption<ReviewBatchOutcome>(REVIEW_REJECT_MANY_METHOD, entries, deps, () =>
    rejectEntries({ config: deps.config.config, cwd: deps.projectRoot, entries }, reviewDeps(deps)),
  );
};

export const retranslateEntriesHandler: RpcHandler<"translation.retranslateEntries"> = async (
  params,
  deps,
) => {
  const entries = uniqueByIdentity(params.entries);
  return surfacingInterruption<RetranslateBatchOutcome>(
    RETRANSLATE_ENTRIES_METHOD,
    entries,
    deps,
    () =>
      retranslateEntries(
        {
          config: deps.config.config,
          cwd: deps.projectRoot,
          entries,
          lockAcquireTimeoutMs: STUDIO_BATCH_LOCK_TIMEOUT_MS,
        },
        {
          ...reviewDeps(deps),
          ...(deps.createProvider !== undefined ? { createProvider: deps.createProvider } : {}),
        },
      ),
  );
};
