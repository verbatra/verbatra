import type { PlaceholderIntegrityResult, TranslationEntry } from "@verbatra/core";
import { checkBatchIntegrity } from "../integrity.js";
import {
  type PlaceholderComparator,
  type PlaceholderExtractor,
  type TranslateRequest,
  type TranslationProvider,
  type ValidatedRequestData,
  validateRequest,
} from "../provider.js";
import { DEFAULT_REQUEST_TIMEOUT_MS, withRequestTimeout } from "../request-timeout.js";
import { applyProviderDegraded, buildEntryReviewFlags } from "../review-flags.js";
import { createDefaultClient } from "./client.js";
import { type DeepLConfig, deepLConfigSchema } from "./config.js";
import { chunkTextsForDeepL } from "./limits.js";
import { assertValidDeepLSourceLocale, assertValidDeepLTargetLocale } from "./locale-validation.js";
import { PLACEHOLDER_UNSUPPORTED_MESSAGE, partitionByPlaceholders } from "./placeholders.js";
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

export interface DeepLDeps {
  readonly client?: DeepLTranslateClient;
  readonly freeAccount?: boolean;
}

export function createDeepLProvider(
  config: DeepLConfig,
  deps: DeepLDeps = {},
): TranslationProvider {
  const validConfig = deepLConfigSchema.parse(config);
  const bundle = resolveClient(deps);
  return {
    id: PROVIDER_ID,
    kind: "machine-translation",
    supportsGlossary: validConfig.glossaryId !== undefined,
    translateBatch: (request: TranslateRequest): Promise<DeepLTranslateResult> =>
      translate(bundle, validConfig, request),
  };
}

function resolveClient(deps: DeepLDeps): DeepLClientBundle {
  if (deps.client !== undefined) {
    return { client: deps.client, freeAccount: deps.freeAccount ?? false };
  }
  return createDefaultClient();
}

async function translate(
  bundle: DeepLClientBundle,
  config: DeepLConfig,
  request: TranslateRequest,
): Promise<DeepLTranslateResult> {
  const data = validateRequest(request);
  assertValidDeepLSourceLocale(data.sourceLocale);
  assertValidDeepLTargetLocale(data.targetLocale);
  const { protectable, unprotectable } = partitionByPlaceholders(data.entries);
  const genericGlossarySupplied =
    request.glossary !== undefined && Object.keys(request.glossary).length > 0;
  const { options, notices } = buildTranslateOptions({
    freeAccount: bundle.freeAccount,
    genericGlossarySupplied,
    ...(data.tone !== undefined ? { tone: data.tone } : {}),
    ...(config.glossaryId !== undefined ? { glossaryId: config.glossaryId } : {}),
  });
  const { values, integrity } = await translateProtectable(
    bundle.client,
    data,
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
      request.glossary,
      data.maxLength,
    ),
    notices,
    [...values.keys()],
  );
  return { values, integrity, notices, reviewFlags };
}

async function translateProtectable(
  client: DeepLTranslateClient,
  data: ValidatedRequestData,
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
    data.sourceLocale,
    data.targetLocale,
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
  return withRequestTimeout(timeoutMs, signal, () =>
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
