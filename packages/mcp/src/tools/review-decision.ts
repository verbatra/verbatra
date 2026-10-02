import { approveEntry, type ReviewDecisionInput, rejectEntry } from "@verbatra/sdk";
import { z } from "zod";
import type { McpToolContext } from "../types.js";
import { defineTool, type ValueRedaction } from "./define-tool.js";
import {
  LOCK_TIMEOUT_DESCRIPTION,
  lockAcquireTimeoutMs,
  lockTimeoutMsSchema,
} from "./lock-timeout.js";
import { keyProvenanceSchema } from "./provenance-schema.js";
import { withoutReviewer } from "./value-redaction.js";

const paramsSchema = z
  .strictObject({
    locale: z.string().min(1),
    key: z.string().min(1),
    expectedValue: z.string().max(20_000).optional(),
    expectedHash: z
      .string()
      .regex(/^[0-9a-f]{16}$/)
      .optional(),
    reviewer: z.string().min(1).max(64),
    lockTimeoutMs: lockTimeoutMsSchema,
  })
  .refine(
    (params) => (params.expectedValue === undefined) !== (params.expectedHash === undefined),
    {
      message: "Pass exactly one of expectedValue and expectedHash.",
      path: ["expectedValue"],
    },
  );

const reviewDecisionResultSchema = z.object({
  locale: z.string(),
  key: z.string(),
  provenance: keyProvenanceSchema,
});

type ReviewDecisionParams = z.infer<typeof paramsSchema>;
type ReviewDecisionResult = z.infer<typeof reviewDecisionResultSchema>;

function decisionInput(params: ReviewDecisionParams, context: McpToolContext): ReviewDecisionInput {
  return {
    config: context.config.config,
    cwd: context.cwd,
    locale: params.locale,
    key: params.key,
    ...(params.expectedValue !== undefined ? { expectedValue: params.expectedValue } : {}),
    ...(params.expectedHash !== undefined ? { expectedValueHash: params.expectedHash } : {}),
    reviewer: params.reviewer,
    lockAcquireTimeoutMs: lockAcquireTimeoutMs(params.lockTimeoutMs),
  };
}

function decisionDeps(context: McpToolContext) {
  return {
    ...(context.fs !== undefined ? { fs: context.fs } : {}),
    ...(context.adapterRegistry !== undefined ? { adapterRegistry: context.adapterRegistry } : {}),
    ...(context.valueMarker !== undefined ? { valueMarker: context.valueMarker } : {}),
  };
}

const REDACT_REVIEWER: ValueRedaction<ReviewDecisionParams, ReviewDecisionResult> = {
  redact: (result) => ({ ...result, provenance: withoutReviewer(result.provenance) }),
};

const PERSON_ONLY =
  "Call it only when the user has read the value and told you to record this decision: never " +
  "decide on your own translations or edits on your own initiative, because the decision is " +
  "recorded as the named person's review. ";

const SHARED_PARAMS =
  "The required locale parameter must be a configured target locale and the required key " +
  "parameter must exist in the source. Pass exactly one of expectedValue, the translation the " +
  "user reviewed as read with key.value, and expectedHash, the 16-digit hash from that value's " +
  "marker when the server redacts values; the call is refused with REVIEW_VALUE_CHANGED, " +
  "writing nothing, when the current value is a different one. The required reviewer parameter " +
  "names the person who made the decision, 1 to 64 characters with no control characters; it is " +
  "stored in the committed verbatra.provenance.json, so it is public. ";

export const reviewApproveTool = defineTool({
  name: "review.approve",
  values: REDACT_REVIEWER,
  description:
    "Records that a person reviewed one key's current translation in one target locale and " +
    "accepts it. The approval is written to verbatra.provenance.json, so it is shared with every " +
    "teammate and CI job that pulls the file, the key leaves review.queue, and it counts for " +
    "verbatra check --require-reviewed. " +
    PERSON_ONLY +
    SHARED_PARAMS +
    "A value whose source text changed since it was written is refused with " +
    "REVIEW_SOURCE_CHANGED: correct it with translation.editEntry first. Any later write that " +
    "changes the value drops the approval again. It never touches a locale file or the lock " +
    "file, calls no provider, and costs nothing; approving the same value again changes " +
    "nothing. " +
    LOCK_TIMEOUT_DESCRIPTION +
    "Always listed: it needs no spend capability.",
  paramsSchema,
  outputSchema: reviewDecisionResultSchema,
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  handler: async (params, context): Promise<ReviewDecisionResult> =>
    approveEntry(decisionInput(params, context), decisionDeps(context)),
});

const REJECT_DESCRIPTION =
  "Records that a person reviewed one key's current translation in one target locale and " +
  "refuses it, and removes that translation so it gets replaced. The value is deleted from the " +
  "locale file and its lock entry is dropped, so the key reads as missing until the next " +
  "translate run or a person fills it; there is no undo on this surface, so read the value with " +
  "key.value first. A rejected record stays in verbatra.provenance.json, so no translation " +
  "memory puts the same text back. " +
  PERSON_ONLY +
  SHARED_PARAMS +
  "A format that cannot drop one value, such as XLIFF, is refused with " +
  "REVIEW_REJECT_UNSUPPORTED and keeps the file: correct the value with translation.editEntry " +
  "instead. It calls no provider and costs nothing. " +
  LOCK_TIMEOUT_DESCRIPTION +
  "Always listed: it needs no spend capability.";

export const reviewRejectTool = defineTool({
  name: "review.reject",
  values: REDACT_REVIEWER,
  description: REJECT_DESCRIPTION,
  paramsSchema,
  outputSchema: reviewDecisionResultSchema,
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: false,
  },
  handler: async (params, context): Promise<ReviewDecisionResult> =>
    rejectEntry(decisionInput(params, context), decisionDeps(context)),
});
