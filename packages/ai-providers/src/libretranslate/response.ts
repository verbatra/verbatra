import { z } from "zod";
import { ProviderError, type ProviderErrorCode } from "../errors.js";
import { LIBRETRANSLATE_ENV_VAR } from "../key-env-vars.js";

const successSchema = z.object({ translatedText: z.array(z.string()) });

const errorSchema = z.object({ error: z.string() });

const KEY_REQUIRED = /api key/i;
const LANGUAGE_UNAVAILABLE = /not supported|not available as a target language/i;
const LIMIT_EXCEEDED = /exceeds text limit/i;
const BANNED = /too many/i;

export const MALFORMED_RESPONSE_MESSAGE =
  "The LibreTranslate server returned a response verbatra could not parse.";
export const MISSING_KEY_MESSAGE =
  `The LibreTranslate server requires an API key, and the ${LIBRETRANSLATE_ENV_VAR} ` +
  "environment variable is not set.";
export const AUTH_FAILED_MESSAGE =
  `The LibreTranslate server rejected the API key in ${LIBRETRANSLATE_ENV_VAR}. Check the key ` +
  "with the server operator.";
export const RATE_LIMITED_MESSAGE =
  "The LibreTranslate server rate-limited this request. Wait for its limit to reset, or ask the " +
  "server operator to raise it, then retry.";
export const LANGUAGE_UNAVAILABLE_MESSAGE =
  "The LibreTranslate server has no language model for the source or target locale. Install the " +
  "model on the server, or map the locale to an installed code in provider.options.localeMap, " +
  "and run verbatra doctor --locales --live to see what the server offers.";
export const LIMIT_EXCEEDED_MESSAGE =
  "The request exceeded the LibreTranslate server's character or batch limit. Lower maxBatchSize " +
  "in the config, or raise the server's --char-limit or --batch-limit.";
export const INVALID_REQUEST_MESSAGE =
  "The LibreTranslate server rejected the request as malformed or unsupported.";
export const NOT_FOUND_MESSAGE =
  "The LibreTranslate server answered HTTP 404. Check that provider.options.baseUrl points at " +
  "the root of the LibreTranslate API.";
export const PROVIDER_UNAVAILABLE_MESSAGE = "The LibreTranslate server is currently unavailable.";
export const PROVIDER_ERROR_MESSAGE = "The translation provider request failed.";

interface Classification {
  readonly code: ProviderErrorCode;
  readonly message: string;
}

function errorTextOf(body: unknown): string {
  const parsed = errorSchema.safeParse(body);
  return parsed.success ? parsed.data.error : "";
}

function classifyBadRequest(errorText: string, keyConfigured: boolean): Classification {
  if (KEY_REQUIRED.test(errorText)) {
    return keyConfigured
      ? { code: "AUTH_FAILED", message: AUTH_FAILED_MESSAGE }
      : { code: "MISSING_API_KEY", message: MISSING_KEY_MESSAGE };
  }
  if (LANGUAGE_UNAVAILABLE.test(errorText)) {
    return { code: "INVALID_REQUEST", message: LANGUAGE_UNAVAILABLE_MESSAGE };
  }
  if (LIMIT_EXCEEDED.test(errorText)) {
    return { code: "INVALID_REQUEST", message: LIMIT_EXCEEDED_MESSAGE };
  }
  return { code: "INVALID_REQUEST", message: INVALID_REQUEST_MESSAGE };
}

function classifyForbidden(errorText: string): Classification {
  return BANNED.test(errorText)
    ? { code: "RATE_LIMITED", message: RATE_LIMITED_MESSAGE }
    : { code: "AUTH_FAILED", message: AUTH_FAILED_MESSAGE };
}

function classifyErrorStatus(
  status: number,
  errorText: string,
  keyConfigured: boolean,
): Classification {
  switch (status) {
    case 400:
      return classifyBadRequest(errorText, keyConfigured);
    case 401:
      return { code: "AUTH_FAILED", message: AUTH_FAILED_MESSAGE };
    case 403:
      return classifyForbidden(errorText);
    case 404:
      return { code: "PROVIDER_ERROR", message: NOT_FOUND_MESSAGE };
    case 429:
      return { code: "RATE_LIMITED", message: RATE_LIMITED_MESSAGE };
    default:
      return status >= 500 && status <= 599
        ? { code: "PROVIDER_UNAVAILABLE", message: PROVIDER_UNAVAILABLE_MESSAGE }
        : { code: "PROVIDER_ERROR", message: PROVIDER_ERROR_MESSAGE };
  }
}

function toProviderError({ code, message }: Classification): ProviderError {
  return code === "MISSING_API_KEY"
    ? new ProviderError(code, message, { envVar: LIBRETRANSLATE_ENV_VAR })
    : new ProviderError(code, message);
}

export function parseLibreTranslateHttpResult(
  status: number,
  body: unknown,
  keyConfigured: boolean,
): readonly string[] {
  if (status >= 200 && status < 300) {
    const parsed = successSchema.safeParse(body);
    if (!parsed.success) {
      throw new ProviderError("INVALID_RESPONSE", MALFORMED_RESPONSE_MESSAGE);
    }
    return parsed.data.translatedText;
  }
  throw toProviderError(classifyErrorStatus(status, errorTextOf(body), keyConfigured));
}
