import { redactKeys } from "./redaction.js";

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
  | "PROVIDER_ERROR";

export class ProviderError extends Error {
  readonly code: ProviderErrorCode;

  constructor(code: ProviderErrorCode, message: string) {
    super(redactKeys(message));
    this.name = "ProviderError";
    this.code = code;
  }
}
