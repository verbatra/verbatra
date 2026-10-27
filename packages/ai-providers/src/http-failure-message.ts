import type { ClassifiedProviderErrorCode } from "./error-classification.js";

const SAFE_VENDOR_ERROR_TYPE = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;
const GENERIC_VENDOR_ERROR_TYPE = "error";

export type EndpointRemedies = "chat-completions" | "zen-chat-completions";

export const BASE_URL_REMEDY =
  "Check that provider.options.baseUrl points at the API root, usually ending in /v1, not at " +
  "/chat/completions.";
export const REJECTED_REQUEST_REMEDY =
  "The server rejected the request: check the model name and whether the server supports Chat " +
  "Completions with strict JSON schema output.";
export const ZEN_MODEL_REMEDY =
  "The model must be one that OpenCode Zen serves over the Chat Completions endpoint.";
export const REFUSED_REQUEST_REMEDY =
  "The server refused the request under its policy or the key's permissions.";

export const LEAD_BY_CODE: Readonly<Record<ClassifiedProviderErrorCode, string>> = {
  RATE_LIMITED: "The translation provider rate-limited this request",
  TIMEOUT: "The translation provider request timed out",
  AUTH_FAILED: "The translation provider rejected the request credentials",
  PROVIDER_UNAVAILABLE: "The translation provider is currently unavailable",
  PROVIDER_ERROR: "The translation provider request failed",
};

const REFUSED_LEAD = "The translation provider refused the request";

const CHAT_COMPLETIONS_REMEDY_BY_STATUS: Readonly<Record<number, string>> = {
  400: REJECTED_REQUEST_REMEDY,
  404: BASE_URL_REMEDY,
  405: BASE_URL_REMEDY,
  422: REJECTED_REQUEST_REMEDY,
};

const ZEN_REMEDY_BY_STATUS: Readonly<Record<number, string>> = {
  400: ZEN_MODEL_REMEDY,
  404: ZEN_MODEL_REMEDY,
  422: ZEN_MODEL_REMEDY,
};

const REMEDY_TABLES: Readonly<Record<EndpointRemedies, Readonly<Record<number, string>>>> = {
  "chat-completions": CHAT_COMPLETIONS_REMEDY_BY_STATUS,
  "zen-chat-completions": ZEN_REMEDY_BY_STATUS,
};

const FORBIDDEN_STATUS = 403;

export interface HttpFailure {
  readonly status: number;
  readonly vendorType: string | undefined;
}

export interface FailureEndpoint {
  readonly host: string | undefined;
  readonly remedies: EndpointRemedies | undefined;
}

function fieldOf(value: unknown, field: string): unknown {
  return typeof value === "object" && value !== null && field in value
    ? (value as Readonly<Record<string, unknown>>)[field]
    : undefined;
}

function isSafeVendorType(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value !== GENERIC_VENDOR_ERROR_TYPE &&
    SAFE_VENDOR_ERROR_TYPE.test(value)
  );
}

export function vendorErrorTypeOf(error: unknown): string | undefined {
  const body = fieldOf(error, "error");
  const candidates = [
    fieldOf(error, "type"),
    fieldOf(body, "type"),
    fieldOf(fieldOf(body, "error"), "type"),
  ];
  return candidates.find(isSafeVendorType);
}

export function requestFailedLead(endpointHost: string | undefined): string {
  return endpointHost === undefined
    ? LEAD_BY_CODE.PROVIDER_ERROR
    : `The translation provider request to ${endpointHost} failed`;
}

function statusLabel({ status, vendorType }: HttpFailure): string {
  return vendorType === undefined ? `HTTP ${status}` : `HTTP ${status}, ${vendorType}`;
}

function leadFor(
  code: ClassifiedProviderErrorCode,
  status: number,
  endpointHost: string | undefined,
): string {
  if (status === FORBIDDEN_STATUS) {
    return REFUSED_LEAD;
  }
  return code === "PROVIDER_ERROR" ? requestFailedLead(endpointHost) : LEAD_BY_CODE[code];
}

function remedyFor(status: number, remedies: EndpointRemedies | undefined): string | undefined {
  if (status === FORBIDDEN_STATUS) {
    return REFUSED_REQUEST_REMEDY;
  }
  return remedies === undefined ? undefined : REMEDY_TABLES[remedies][status];
}

export function httpFailureMessage(
  code: ClassifiedProviderErrorCode,
  failure: HttpFailure,
  endpoint: FailureEndpoint,
): string {
  const headline = `${leadFor(code, failure.status, endpoint.host)} (${statusLabel(failure)}).`;
  const remedy = remedyFor(failure.status, endpoint.remedies);
  return remedy === undefined ? headline : `${headline} ${remedy}`;
}
