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
import type { RpcHandler, RpcHandlerDeps } from "../rpc.js";

export const STUDIO_BATCH_LOCK_TIMEOUT_MS = 30_000;

function reviewDeps(deps: RpcHandlerDeps) {
  return {
    ...(deps.fs !== undefined ? { fs: deps.fs } : {}),
    ...(deps.adapterRegistry !== undefined ? { adapterRegistry: deps.adapterRegistry } : {}),
  };
}

export function uniqueEntries<E extends BatchEntry>(entries: readonly E[]): E[] {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    const id = JSON.stringify([entry.locale, entry.key]);
    if (seen.has(id)) {
      return false;
    }
    seen.add(id);
    return true;
  });
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
    message: redact(error.message),
  }));
}

async function surfacingInterruption<R>(
  entries: readonly BatchEntry[],
  run: () => Promise<{ readonly results: readonly R[] }>,
): Promise<{ readonly results: readonly (R | BatchEntryFailure)[] }> {
  try {
    return await run();
  } catch (error) {
    if (!(error instanceof BatchInterruptedError)) {
      throw error;
    }
    const completed = error.results as readonly R[];
    return { results: [...completed, ...interruptedOutcomes(entries, error)] };
  }
}

export const reviewApproveManyHandler: RpcHandler<"review.approveMany"> = async (params, deps) => {
  const entries = uniqueEntries(params.entries);
  return surfacingInterruption<ReviewBatchOutcome>(entries, () =>
    approveEntries(
      { config: deps.config.config, cwd: deps.projectRoot, entries },
      reviewDeps(deps),
    ),
  );
};

export const reviewRejectManyHandler: RpcHandler<"review.rejectMany"> = async (params, deps) => {
  const entries = uniqueEntries(params.entries);
  return surfacingInterruption<ReviewBatchOutcome>(entries, () =>
    rejectEntries({ config: deps.config.config, cwd: deps.projectRoot, entries }, reviewDeps(deps)),
  );
};

export const retranslateEntriesHandler: RpcHandler<"translation.retranslateEntries"> = async (
  params,
  deps,
) => {
  const entries = uniqueEntries(params.entries);
  return surfacingInterruption<RetranslateBatchOutcome>(entries, () =>
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
