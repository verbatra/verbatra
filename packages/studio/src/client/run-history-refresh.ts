import type { RpcMethodName, RpcParamsFor } from "../shared/rpc/contract.js";
import { RETRANSLATE_ENTRIES_METHOD } from "../shared/rpc/retranslate-entries.js";
import { RETRANSLATE_ENTRY_METHOD } from "../shared/rpc/retranslate-entry.js";
import { TRANSLATE_PENDING_METHOD } from "../shared/rpc/translate-pending.js";
import type { RpcCallResult, RpcClient } from "./rpc-client.js";

const RUN_METHODS: ReadonlySet<RpcMethodName> = new Set([
  TRANSLATE_PENDING_METHOD,
  RETRANSLATE_ENTRY_METHOD,
  RETRANSLATE_ENTRIES_METHOD,
]);

export function refreshAfterRuns(client: RpcClient, onRunReturned: () => void): RpcClient {
  return {
    async call<M extends RpcMethodName>(
      method: M,
      params: RpcParamsFor<M>,
    ): Promise<RpcCallResult<M>> {
      try {
        return await client.call(method, params);
      } finally {
        if (RUN_METHODS.has(method)) {
          onRunReturned();
        }
      }
    },
  };
}

export const FOCUS_REFRESH_MIN_GAP_MS = 1000;

export interface FocusRefreshSources {
  readonly isVisible: () => boolean;
  readonly now: () => number;
}

export function createFocusRefresher(
  onRefresh: () => void,
  sources: FocusRefreshSources,
): () => void {
  let lastAt = Number.NEGATIVE_INFINITY;
  return () => {
    if (!sources.isVisible()) {
      return;
    }
    const at = sources.now();
    if (at - lastAt < FOCUS_REFRESH_MIN_GAP_MS) {
      return;
    }
    lastAt = at;
    onRefresh();
  };
}
