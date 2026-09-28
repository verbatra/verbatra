import { redactKeys } from "./redaction.js";

/**
 * The stable code a {@link ProviderError} carries. Branch on it rather than on the message; the
 * providers page of the documentation says what each one means.
 */
export type ProviderErrorCode =
  | "MISSING_API_KEY"
  | "INVALID_REQUEST"
  | "INVALID_RESPONSE"
  | "OUTPUT_TRUNCATED"
  | "PROVIDER_REFUSED"
  | "PROVIDER_BLOCKED"
  | "RATE_LIMITED"
  | "TIMEOUT"
  | "AUTH_FAILED"
  | "PROVIDER_UNAVAILABLE"
  | "NETWORK_POLICY_VIOLATION"
  | "PROVIDER_ERROR";

/**
 * The structured error a translation provider fails with, in place of a raw SDK or HTTP error. Its
 * `name` is `"ProviderError"` and its message is fixed and secret-free: every API key shape and
 * configured key value is redacted before it is stored.
 */
export class ProviderError extends Error {
  /** The stable failure code, one of {@link ProviderErrorCode}. */
  readonly code: ProviderErrorCode;

  /**
   * The name of the environment variable the provider reads its API key from, on a
   * `MISSING_API_KEY` failure. A variable name, never its value. Absent on every other failure.
   */
  readonly envVar?: string;

  /**
   * @param code - The failure code.
   * @param message - A description of the failure; key shapes and configured key values in it are
   * replaced by `[REDACTED]`.
   * @param details - `envVar` names the API key environment variable a `MISSING_API_KEY` failure
   * is about.
   */
  constructor(code: ProviderErrorCode, message: string, details?: { readonly envVar?: string }) {
    super(redactKeys(message));
    this.name = "ProviderError";
    this.code = code;
    if (details?.envVar !== undefined) {
      this.envVar = details.envVar;
    }
  }
}
