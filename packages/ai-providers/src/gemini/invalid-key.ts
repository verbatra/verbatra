import { getErrorStatus } from "../error-classification.js";
import { googleErrorDetails } from "../retry-delay.js";

const INVALID_KEY_REASON = "API_KEY_INVALID";
const BAD_REQUEST_STATUS = 400;

function reasonOf(detail: unknown): unknown {
  return typeof detail === "object" && detail !== null && "reason" in detail
    ? (detail as { readonly reason?: unknown }).reason
    : undefined;
}

export function isInvalidKeyFailure(error: unknown): boolean {
  return (
    getErrorStatus(error) === BAD_REQUEST_STATUS &&
    googleErrorDetails(error).some((detail) => reasonOf(detail) === INVALID_KEY_REASON)
  );
}
