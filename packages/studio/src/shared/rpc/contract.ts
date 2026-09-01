import type { z } from "zod";
import { STATUS_CHECK_METHOD, type StatusCheckResult, statusCheckParamsSchema } from "./check.js";
import { STATUS_DIFF_METHOD, type StatusDiffResult, statusDiffParamsSchema } from "./diff.js";
import { EDIT_ENTRY_METHOD, type EditEntryResult, editEntryParamsSchema } from "./edit-entry.js";
import {
  GLOSSARY_GET_METHOD,
  GLOSSARY_WRITE_METHOD,
  type GlossaryGetResult,
  type GlossaryWriteResult,
  glossaryGetParamsSchema,
  glossaryWriteParamsSchema,
} from "./glossary.js";
import { HISTORY_LIST_METHOD, type HistoryListResult, historyListParamsSchema } from "./history.js";
import {
  KEY_INTEGRITY_METHOD,
  type KeyIntegrityResult,
  keyIntegrityParamsSchema,
} from "./key-integrity.js";
import { KEY_VALUE_METHOD, type KeyValueResult, keyValueParamsSchema } from "./key-value.js";
import {
  LOCALE_VALUES_METHOD,
  type LocaleValuesResult,
  localeValuesParamsSchema,
} from "./locale-values.js";
import { LOCK_STATE_METHOD, type LockStateResult, lockStateParamsSchema } from "./lock.js";
import {
  RETRANSLATE_ENTRY_METHOD,
  type RetranslateEntryResult,
  retranslateEntryParamsSchema,
} from "./retranslate-entry.js";
import {
  REVIEW_QUEUE_METHOD,
  type ReviewQueueResult,
  reviewQueueParamsSchema,
} from "./review-queue.js";
import {
  PROJECT_SNAPSHOT_METHOD,
  type ProjectSnapshotResult,
  projectSnapshotParamsSchema,
} from "./snapshot.js";
import {
  TRANSLATE_PENDING_METHOD,
  type TranslatePendingResult,
  translatePendingParamsSchema,
} from "./translate-pending.js";
import {
  USAGE_SUMMARY_METHOD,
  type UsageSummaryResult,
  usageSummaryParamsSchema,
} from "./usage-summary.js";

export const rpcParamsSchemas = {
  [PROJECT_SNAPSHOT_METHOD]: projectSnapshotParamsSchema,
  [STATUS_CHECK_METHOD]: statusCheckParamsSchema,
  [STATUS_DIFF_METHOD]: statusDiffParamsSchema,
  [GLOSSARY_GET_METHOD]: glossaryGetParamsSchema,
  [GLOSSARY_WRITE_METHOD]: glossaryWriteParamsSchema,
  [LOCK_STATE_METHOD]: lockStateParamsSchema,
  [HISTORY_LIST_METHOD]: historyListParamsSchema,
  [KEY_INTEGRITY_METHOD]: keyIntegrityParamsSchema,
  [RETRANSLATE_ENTRY_METHOD]: retranslateEntryParamsSchema,
  [REVIEW_QUEUE_METHOD]: reviewQueueParamsSchema,
  [EDIT_ENTRY_METHOD]: editEntryParamsSchema,
  [KEY_VALUE_METHOD]: keyValueParamsSchema,
  [LOCALE_VALUES_METHOD]: localeValuesParamsSchema,
  [TRANSLATE_PENDING_METHOD]: translatePendingParamsSchema,
  [USAGE_SUMMARY_METHOD]: usageSummaryParamsSchema,
} as const;

export type RpcMethodName = keyof typeof rpcParamsSchemas;

export const RPC_METHOD_NAMES = Object.keys(rpcParamsSchemas) as readonly RpcMethodName[];

export interface RpcResultMap {
  readonly [PROJECT_SNAPSHOT_METHOD]: ProjectSnapshotResult;
  readonly [STATUS_CHECK_METHOD]: StatusCheckResult;
  readonly [STATUS_DIFF_METHOD]: StatusDiffResult;
  readonly [GLOSSARY_GET_METHOD]: GlossaryGetResult;
  readonly [GLOSSARY_WRITE_METHOD]: GlossaryWriteResult;
  readonly [LOCK_STATE_METHOD]: LockStateResult;
  readonly [HISTORY_LIST_METHOD]: HistoryListResult;
  readonly [KEY_INTEGRITY_METHOD]: KeyIntegrityResult;
  readonly [RETRANSLATE_ENTRY_METHOD]: RetranslateEntryResult;
  readonly [REVIEW_QUEUE_METHOD]: ReviewQueueResult;
  readonly [EDIT_ENTRY_METHOD]: EditEntryResult;
  readonly [KEY_VALUE_METHOD]: KeyValueResult;
  readonly [LOCALE_VALUES_METHOD]: LocaleValuesResult;
  readonly [TRANSLATE_PENDING_METHOD]: TranslatePendingResult;
  readonly [USAGE_SUMMARY_METHOD]: UsageSummaryResult;
}

export type RpcParamsFor<M extends RpcMethodName> = z.infer<(typeof rpcParamsSchemas)[M]>;

export type RpcResultFor<M extends RpcMethodName> = RpcResultMap[M];

export type RpcRequest = {
  [M in RpcMethodName]: { readonly method: M; readonly params: RpcParamsFor<M> };
}[RpcMethodName];
