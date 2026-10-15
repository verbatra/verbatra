import type { ClassifiedProviderErrorCode } from "./error-classification.js";

const SAFE_VENDOR_ERROR_TYPE = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/;
const GENERIC_VENDOR_ERROR_TYPE = "error";

export const BASE_URL_REMEDY =
  "Check that provider.options.baseUrl points at the API root, usually ending in /v1, not at " +
  "/chat/completions.";
export const REJECTED_REQUEST_REMEDY =
  "The server rejected the request: check the model name and whether the server supports Chat " +
  "Completions with strict JSON schema output.";
export const REFUSED_REQUEST_REMEDY =
  "The server refused the request under its policy or the key's permissions.";

const ENDPOINT_REMEDY_BY_STATUS: Readonly<Record<number, string>> = {
  400: REJECTED_REQUEST_REMEDY,
  404: BASE_URL_REMEDY,
  405: BASE_URL_REMEDY,
  422: REJECTED_REQUEST_REMEDY,
};

const FORBIDDEN_STATUS = 403;

export interface HttpFailure {
  readonly status: number;
  readonly vendorType: string | undefined;
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

function statusLabel({ status, vendorType }: HttpFailure): string {
  return vendorType === undefined ? `HTTP ${status}` : `HTTP ${status}, ${vendorType}`;
}

function remedyFor(status: number, endpointConfigured: boolean): string | undefined {
  if (status === FORBIDDEN_STATUS) {
    return REFUSED_REQUEST_REMEDY;
  }
  return endpointConfigured ? ENDPOINT_REMEDY_BY_STATUS[status] : undefined;
}

function headlineFor(
  code: ClassifiedProviderErrorCode,
  failure: HttpFailure,
  endpointHost: string | undefined,
  fallback: string,
): string {
  if (code === "PROVIDER_ERROR") {
    const where = endpointHost === undefined ? "" : ` to ${endpointHost}`;
    const type = failure.vendorType === undefined ? "" : ` (${failure.vendorType})`;
    return `The translation provider request${where} failed with HTTP ${failure.status}${type}.`;
  }
  const lead =
    failure.status === FORBIDDEN_STATUS
      ? "The translation provider refused the request"
      : fallback.replace(/\.$/, "");
  return `${lead} (${statusLabel(failure)}).`;
}

export function httpFailureMessage(
  code: ClassifiedProviderErrorCode,
  failure: HttpFailure,
  endpointHost: string | undefined,
  fallback: string,
): string {
  const headline = headlineFor(code, failure, endpointHost, fallback);
  const remedy = remedyFor(failure.status, endpointHost !== undefined);
  return remedy === undefined ? headline : `${headline} ${remedy}`;
}
