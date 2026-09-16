import type { IntegrityGateReason } from "@verbatra/sdk";
import type { RpcCallResult } from "./rpc-client.js";

export type RetranslateOutcome =
  | { readonly kind: "success" }
  | {
      readonly kind: "rejected";
      readonly reason: IntegrityGateReason;
      readonly details?: readonly string[];
    }
  | { readonly kind: "error"; readonly message: string };

export function deriveRetranslateOutcome(
  response: RpcCallResult<"translation.retranslateEntry">,
): RetranslateOutcome {
  if (!response.ok) {
    return { kind: "error", message: response.error.message };
  }
  if (!response.result.accepted) {
    const details = response.result.details;
    return {
      kind: "rejected",
      reason: response.result.reason,
      ...(details !== undefined ? { details } : {}),
    };
  }
  return { kind: "success" };
}
