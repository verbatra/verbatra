import type { PlaceholderIntegrityResult, TranslationEntry } from "@verbatra/core";
import { appliesTerms } from "../glossary.js";
import { checkBatchIntegrity } from "../integrity.js";
import { supportsFormality } from "../language-support.js";
import { resolveProviderLocale } from "../locale-map.js";
import {
  PLACEHOLDER_UNSUPPORTED_MESSAGE,
  partitionByPlaceholders,
} from "../placeholder-protection.js";
import {
  type PlaceholderComparator,
  type PlaceholderExtractor,
  type TranslateRequest,
  type TranslationProvider,
  type ValidatedRequestData,
  validateRequest,
} from "../provider.js";
import { DEFAULT_REQUEST_TIMEOUT_MS, withSdkAttemptTimeout } from "../request-timeout.js";
import { applyProviderDegraded, buildEntryReviewFlags } from "../review-flags.js";
import { createDefaultClient } from "./client.js";
import { type DeepLConfig, deepLConfigSchema } from "./config.js";
import { DEEPL_LANGUAGE_TABLE } from "./languages.js";
import { chunkTextsForDeepL } from "./limits.js";
import { toDeepLSourceCode, toDeepLTargetCode } from "./locale-codes.js";
import { assertValidDeepLSourceLocale, assertValidDeepLTargetLocale } from "./locale-validation.js";
import { buildTranslateOptions } from "./request.js";
import { zipResults } from "./response.js";
import type {
  DeepLClientBundle,
  DeepLTextResult,
  DeepLTranslateClient,
  DeepLTranslateOptions,
  DeepLTranslateResult,
} from "./types.js";

const PROVIDER_ID = "deepl";

interface DeepLLanguages {
  readonly sourceLang: string;
  readonly targetLang: string;
}

export interface DeepLDeps {
  readonly client?: DeepLTranslateClient;
  readonly freeAccount?: boolean;
}

export function createDeepLProvider(
  config: DeepLConfig,
  deps: DeepLDeps = {},
): TranslationProvider {
  const validConfig = deepLConfigSchema.parse(config);
  const bundle = resolveClient(deps, validConfig.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS);
  return {
    id: PROVIDER_ID,
    kind: "machine-translation",
    supportsGlossary: validConfig.glossaryId !== undefined,
    translateBatch: (request: TranslateRequest): Promise<DeepLTranslateResult> =>
      translate(bundle, validConfig, request),
  };
}

function resolveClient(deps: DeepLDeps, timeoutMs: number): DeepLClientBundle {
  if (deps.client !== undefined) {
    return { client: deps.client, freeAccount: deps.freeAccount ?? false };
  }
  return createDefaultClient(timeoutMs);
}

async function translate(
  bundle: DeepLClientBundle,
  config: DeepLConfig,
  request: TranslateRequest,
): Promise<DeepLTranslateResult> {
  const data = validateRequest(request);
  const languages = resolveDeepLLanguages(config, data);
  const { protectable, unprotectable } = partitionByPlaceholders(data.entries);
  const genericGlossarySupplied = appliesTerms(data.glossary);
  const { options, notices } = buildTranslateOptions({
    freeAccount: bundle.freeAccount,
    formalityAvailable: supportsFormality(DEEPL_LANGUAGE_TABLE, languages.targetLang),
    genericGlossarySupplied,
    ...(data.tone !== undefined ? { tone: data.tone } : {}),
    ...(config.glossaryId !== undefined ? { glossaryId: config.glossaryId } : {}),
  });
  const { values, integrity } = await translateProtectable(
    bundle.client,
    languages,
    protectable,
    options,
    request.extractPlaceholders,
    request.comparePlaceholders,
    config.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
    request.signal,
  );
  if (unprotectable.length > 0) {
    notices.push({ code: "PLACEHOLDER_UNSUPPORTED", message: PLACEHOLDER_UNSUPPORTED_MESSAGE });
  }
  const reviewFlags = applyProviderDegraded(
    buildEntryReviewFlags(
      protectable,
      values,
      integrity,
      data.sourceLocale,
      data.targetLocale,
      data.glossary,
      data.maxLength,
    ),
    notices,
    [...values.keys()],
  );
  return { values, integrity, notices, reviewFlags };
}

function resolveDeepLLanguages(config: DeepLConfig, data: ValidatedRequestData): DeepLLanguages {
  const sourceLang = resolveProviderLocale(data.sourceLocale, config.localeMap, toDeepLSourceCode);
  const targetLang = resolveProviderLocale(data.targetLocale, config.localeMap, toDeepLTargetCode);
  assertValidDeepLSourceLocale(sourceLang, data.sourceLocale);
  assertValidDeepLTargetLocale(targetLang, data.targetLocale);
  return { sourceLang, targetLang };
}

async function translateProtectable(
  client: DeepLTranslateClient,
  languages: DeepLLanguages,
  protectable: readonly TranslationEntry[],
  options: DeepLTranslateOptions,
  extract: PlaceholderExtractor,
  compare: PlaceholderComparator | undefined,
  timeoutMs: number,
  signal: AbortSignal | undefined,
): Promise<{
  values: Map<string, string>;
  integrity: Map<string, PlaceholderIntegrityResult>;
}> {
  if (protectable.length === 0) {
    return { values: new Map(), integrity: new Map() };
  }
  const texts = protectable.map((entry) => entry.value);
  const results = await callClientChunked(
    client,
    texts,
    languages.sourceLang,
    languages.targetLang,
    options,
    timeoutMs,
    signal,
  );
  const { values, integrityInputs } = zipResults(protectable, results);
  const integrity = checkBatchIntegrity(integrityInputs, extract, compare);
  return { values, integrity };
}

function callClient(
  client: DeepLTranslateClient,
  texts: readonly string[],
  sourceLang: string,
  targetLang: string,
  options: DeepLTranslateOptions,
  timeoutMs: number,
  signal: AbortSignal | undefined,
): Promise<DeepLTextResult[]> {
  return withSdkAttemptTimeout(timeoutMs, signal, () =>
    client.translateText(texts, sourceLang, targetLang, options),
  );
}

async function callClientChunked(
  client: DeepLTranslateClient,
  texts: readonly string[],
  sourceLang: string,
  targetLang: string,
  options: DeepLTranslateOptions,
  timeoutMs: number,
  signal: AbortSignal | undefined,
): Promise<DeepLTextResult[]> {
  const results: DeepLTextResult[] = [];
  for (const chunk of chunkTextsForDeepL(texts)) {
    const chunkResults = await callClient(
      client,
      chunk,
      sourceLang,
      targetLang,
      options,
      timeoutMs,
      signal,
    );
    results.push(...chunkResults);
  }
  return results;
}
