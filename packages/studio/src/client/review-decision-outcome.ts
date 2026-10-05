import { resolveErrorCopy } from "./error-copy.js";
import type { RpcCallResult } from "./rpc-client.js";

export type ReviewDecisionMethod = "review.approve" | "review.reject";

export type ReviewDecisionOutcome =
  | { readonly kind: "success" }
  | { readonly kind: "error"; readonly code: string; readonly message: string };

export function deriveReviewDecisionOutcome(
  response: RpcCallResult<ReviewDecisionMethod>,
): ReviewDecisionOutcome {
  return response.ok
    ? { kind: "success" }
    : { kind: "error", code: response.error.code, message: resolveErrorCopy(response.error) };
}

export function isStaleValueOutcome(outcome: ReviewDecisionOutcome): boolean {
  return outcome.kind === "error" && outcome.code === "REVIEW_VALUE_CHANGED";
}
