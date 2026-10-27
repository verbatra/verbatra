import { ProviderError, type ProviderErrorCode } from "./errors.js";
import { type LocaleMap, resolveProviderLocale } from "./locale-map.js";
import type { FetchLike } from "./network/guarded-fetch.js";
import { findNetworkPolicyViolation } from "./network/guarded-fetch.js";
import type { ClientTransport } from "./network/transport.js";
import type {
  ProviderLanguage,
  ProviderLanguageSupport,
  ProviderLanguageTable,
} from "./provider.js";

export type LanguageRole = "source" | "target";

export type LanguageMatch = "exact" | "base" | "none";

export interface ProviderCode {
  readonly code: string;
  readonly mapped: boolean;
}

export const LANGUAGE_LIST_TIMEOUT_MS = 30_000;

function baseLanguageOf(code: string): string {
  return code.split("-")[0] ?? code;
}

function findEntry(table: ProviderLanguageTable, code: string): ProviderLanguage | undefined {
  const wanted = code.toLowerCase();
  return table.languages.find((language) => language.code.toLowerCase() === wanted);
}

function entriesFor(table: ProviderLanguageTable, code: string): readonly ProviderLanguage[] {
  const base = baseLanguageOf(code);
  return [findEntry(table, code), base === code ? undefined : findEntry(table, base)].filter(
    (entry): entry is ProviderLanguage => entry !== undefined,
  );
}

export function matchLanguage(
  table: ProviderLanguageTable,
  code: string,
  role: LanguageRole,
): LanguageMatch {
  if (findEntry(table, code)?.[role] === true) {
    return "exact";
  }
  const base = baseLanguageOf(code);
  return base !== code && findEntry(table, base)?.[role] === true ? "base" : "none";
}

export function supportsFormality(table: ProviderLanguageTable, targetCode: string): boolean {
  return entriesFor(table, targetCode).some((entry) => entry.formality);
}

export function supportsGlossaryPair(
  table: ProviderLanguageTable,
  sourceCode: string,
  targetCode: string,
): boolean {
  const glossaryFor = (code: string): boolean =>
    entriesFor(table, code).some((entry) => entry.glossary);
  return glossaryFor(sourceCode) && glossaryFor(targetCode);
}

export function isWellTestedLanguage(wellTested: readonly string[], code: string): boolean {
  const base = baseLanguageOf(code).toLowerCase();
  return wellTested.includes(base);
}

export function providerCodeFor(
  support: ProviderLanguageSupport,
  locale: string,
  role: LanguageRole,
  localeMap: LocaleMap | undefined,
): ProviderCode {
  const normalize = role === "source" ? support.toSourceCode : support.toTargetCode;
  return {
    code: resolveProviderLocale(locale, localeMap, normalize),
    mapped: localeMap !== undefined && Object.hasOwn(localeMap, locale),
  };
}

function statusCode(status: number): ProviderErrorCode {
  if (status === 401 || status === 403) {
    return "AUTH_FAILED";
  }
  if (status === 429) {
    return "RATE_LIMITED";
  }
  return status >= 500 ? "PROVIDER_UNAVAILABLE" : "PROVIDER_ERROR";
}

function sendFailure(error: unknown, label: string): ProviderError {
  const violation = findNetworkPolicyViolation(error);
  if (violation !== undefined) {
    return new ProviderError("NETWORK_POLICY_VIOLATION", violation.message);
  }
  if (error instanceof Error && error.name === "TimeoutError") {
    return new ProviderError(
      "TIMEOUT",
      `The ${label} request exceeded the ${LANGUAGE_LIST_TIMEOUT_MS} ms timeout.`,
    );
  }
  return new ProviderError("PROVIDER_ERROR", `The ${label} request could not be sent.`);
}

async function readJson(response: Response, label: string): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new ProviderError("INVALID_RESPONSE", `The ${label} response is not valid JSON.`);
  }
}

export async function requestLanguageList(
  transport: ClientTransport<FetchLike>,
  url: string,
  headers: Readonly<Record<string, string>>,
  label: string,
): Promise<unknown> {
  let response: Response;
  try {
    response = await transport.run(() =>
      transport.options(url, {
        method: "GET",
        headers: { ...headers },
        signal: AbortSignal.timeout(LANGUAGE_LIST_TIMEOUT_MS),
      }),
    );
  } catch (error) {
    throw sendFailure(error, label);
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new ProviderError(
      statusCode(response.status),
      `The ${label} request was answered with HTTP ${response.status}.`,
    );
  }
  return readJson(response, label);
}

export function liveTableVersion(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}
