import type { TranslationEntry } from "@verbatra/core";
import { z } from "zod";
import { ProviderError, type ProviderErrorCode } from "../errors.js";
import type { IntegrityInput } from "../integrity.js";

const successSchema = z.object({
  data: z.object({
    translations: z.array(z.object({ translatedText: z.string() })),
  }),
});

const errorDetailSchema = z.object({
  reason: z.string().optional(),
});

const errorSchema = z.object({
  error: z.object({
    errors: z.array(errorDetailSchema).optional(),
  }),
});

const QUOTA_REASONS: ReadonlySet<string> = new Set([
  "dailyLimitExceeded",
  "dailyLimitExceededUnreg",
  "userRateLimitExceeded",
  "rateLimitExceeded",
  "quotaExceeded",
]);

const AUTH_FAILED_STATUSES: ReadonlySet<number> = new Set([401, 403]);
const SERVER_OUTAGE_MIN_STATUS = 500;
const SERVER_OUTAGE_MAX_STATUS = 599;
const RATE_LIMITED_STATUS = 429;
const INVALID_REQUEST_STATUS = 400;

const MALFORMED_RESPONSE_MESSAGE =
  "Google Cloud Translation returned a response verbatra could not parse.";
const MISMATCH_MESSAGE = "The provider returned a mismatched number of translations.";
export const AUTH_FAILED_MESSAGE =
  "Google Cloud Translation rejected the request credentials. Check that " +
  "GOOGLE_TRANSLATE_API_KEY is a valid, unrestricted API key for a Google Cloud project with the " +
  "Cloud Translation API enabled.";
export const RATE_LIMITED_MESSAGE =
  "Google Cloud Translation rate-limited or quota-capped this request. Wait for the quota to " +
  "reset, or raise your project's Cloud Translation quota, then retry.";
export const INVALID_REQUEST_MESSAGE =
  "Google Cloud Translation rejected the request as malformed or unsupported: check the source " +
  "and target locale codes and retry.";
export const PROVIDER_UNAVAILABLE_MESSAGE = "Google Cloud Translation is currently unavailable.";
export const PROVIDER_ERROR_MESSAGE = "The translation provider request failed.";

function extractReasons(body: unknown): readonly string[] {
  const parsed = errorSchema.safeParse(body);
  if (!parsed.success) {
    return [];
  }
  return (parsed.data.error.errors ?? [])
    .map((detail) => detail.reason)
    .filter((reason): reason is string => reason !== undefined);
}

function classifyErrorStatus(
  status: number,
  reasons: readonly string[],
): { code: ProviderErrorCode; message: string } {
  if (status === RATE_LIMITED_STATUS) {
    return { code: "RATE_LIMITED", message: RATE_LIMITED_MESSAGE };
  }
  if (status === INVALID_REQUEST_STATUS) {
    return { code: "INVALID_REQUEST", message: INVALID_REQUEST_MESSAGE };
  }
  if (AUTH_FAILED_STATUSES.has(status)) {
    if (reasons.some((reason) => QUOTA_REASONS.has(reason))) {
      return { code: "RATE_LIMITED", message: RATE_LIMITED_MESSAGE };
    }
    return { code: "AUTH_FAILED", message: AUTH_FAILED_MESSAGE };
  }
  if (status >= SERVER_OUTAGE_MIN_STATUS && status <= SERVER_OUTAGE_MAX_STATUS) {
    return { code: "PROVIDER_UNAVAILABLE", message: PROVIDER_UNAVAILABLE_MESSAGE };
  }
  return { code: "PROVIDER_ERROR", message: PROVIDER_ERROR_MESSAGE };
}

function isSuccessStatus(status: number): boolean {
  return status >= 200 && status < 300;
}

export function parseGoogleTranslateHttpResult(status: number, body: unknown): readonly string[] {
  if (isSuccessStatus(status)) {
    const parsed = successSchema.safeParse(body);
    if (!parsed.success) {
      throw new ProviderError("INVALID_RESPONSE", MALFORMED_RESPONSE_MESSAGE);
    }
    return parsed.data.data.translations.map((translation) => translation.translatedText);
  }
  const { code, message } = classifyErrorStatus(status, extractReasons(body));
  throw new ProviderError(code, message);
}

export function zipResults(
  entries: readonly TranslationEntry[],
  translatedTexts: readonly string[],
): { values: Map<string, string>; integrityInputs: IntegrityInput[] } {
  const values = new Map<string, string>();
  const integrityInputs: IntegrityInput[] = [];
  const resultIter = translatedTexts[Symbol.iterator]();
  for (const entry of entries) {
    const next = resultIter.next();
    if (next.done === true) {
      throw new ProviderError("INVALID_RESPONSE", MISMATCH_MESSAGE);
    }
    const translatedValue = next.value;
    values.set(entry.key, translatedValue);
    integrityInputs.push({ key: entry.key, sourceValue: entry.value, translatedValue });
  }
  if (resultIter.next().done === false) {
    throw new ProviderError("INVALID_RESPONSE", MISMATCH_MESSAGE);
  }
  return { values, integrityInputs };
}
