import type { LoadedConfig } from "@verbatra/sdk";
import { STATUS_CHECK_METHOD } from "../shared/rpc/check.js";
import type { RpcMethodName, RpcParamsFor, RpcResultFor } from "../shared/rpc/contract.js";
import { STATUS_DIFF_METHOD } from "../shared/rpc/diff.js";
import { EDIT_ENTRY_METHOD } from "../shared/rpc/edit-entry.js";
import { GLOSSARY_GET_METHOD, GLOSSARY_WRITE_METHOD } from "../shared/rpc/glossary.js";
import { HISTORY_LIST_METHOD } from "../shared/rpc/history.js";
import { KEY_INTEGRITY_METHOD } from "../shared/rpc/key-integrity.js";
import { KEY_VALUE_METHOD } from "../shared/rpc/key-value.js";
import { LOCALE_VALUES_METHOD } from "../shared/rpc/locale-values.js";
import { LOCK_STATE_METHOD } from "../shared/rpc/lock.js";
import { RETRANSLATE_ENTRY_METHOD } from "../shared/rpc/retranslate-entry.js";
import { REVIEW_QUEUE_METHOD } from "../shared/rpc/review-queue.js";
import { PROJECT_SNAPSHOT_METHOD, type StudioCapabilities } from "../shared/rpc/snapshot.js";
import { TRANSLATE_PENDING_METHOD } from "../shared/rpc/translate-pending.js";
import { USAGE_SUMMARY_METHOD } from "../shared/rpc/usage-summary.js";
import { statusCheckHandler } from "./methods/check.js";
import { statusDiffHandler } from "./methods/diff.js";
import { editEntryHandler } from "./methods/edit-entry.js";
import { glossaryGetHandler, glossaryWriteHandler } from "./methods/glossary.js";
import { historyListHandler } from "./methods/history.js";
import { keyIntegrityHandler } from "./methods/key-integrity.js";
import { keyValueHandler } from "./methods/key-value.js";
import { localeValuesHandler } from "./methods/locale-values.js";
import { lockStateHandler } from "./methods/lock.js";
import { retranslateEntryHandler } from "./methods/retranslate-entry.js";
import { reviewQueueHandler } from "./methods/review-queue.js";
import { snapshotHandler } from "./methods/snapshot.js";
import { translatePendingHandler } from "./methods/translate-pending.js";
import { usageSummaryHandler } from "./methods/usage-summary.js";
import type { StudioServerDeps } from "./types.js";

export type { StudioCapabilities } from "../shared/rpc/snapshot.js";

export interface RpcHandlerDeps
  extends Omit<StudioServerDeps, "loader" | "token" | "output" | "assetsRoot"> {
  readonly config: LoadedConfig;
  readonly projectRoot: string;
}

export type RpcHandler<M extends RpcMethodName> = (
  params: RpcParamsFor<M>,
  deps: RpcHandlerDeps,
) => Promise<RpcResultFor<M>>;

export type HandlersRegistry = { readonly [M in RpcMethodName]?: RpcHandler<M> };

const readOnlyHandlers: HandlersRegistry = {
  [PROJECT_SNAPSHOT_METHOD]: snapshotHandler,
  [STATUS_CHECK_METHOD]: statusCheckHandler,
  [STATUS_DIFF_METHOD]: statusDiffHandler,
  [GLOSSARY_GET_METHOD]: glossaryGetHandler,
  [LOCK_STATE_METHOD]: lockStateHandler,
  [HISTORY_LIST_METHOD]: historyListHandler,
  [KEY_INTEGRITY_METHOD]: keyIntegrityHandler,
  [LOCALE_VALUES_METHOD]: localeValuesHandler,
  [REVIEW_QUEUE_METHOD]: reviewQueueHandler,
  [USAGE_SUMMARY_METHOD]: usageSummaryHandler,
};

export function createRpcHandlers(capabilities: StudioCapabilities): HandlersRegistry {
  return {
    ...readOnlyHandlers,
    [EDIT_ENTRY_METHOD]: editEntryHandler,
    [KEY_VALUE_METHOD]: keyValueHandler,
    [GLOSSARY_WRITE_METHOD]: glossaryWriteHandler,
    ...(capabilities.spend
      ? {
          [RETRANSLATE_ENTRY_METHOD]: retranslateEntryHandler,
          [TRANSLATE_PENDING_METHOD]: translatePendingHandler,
        }
      : {}),
  };
}
