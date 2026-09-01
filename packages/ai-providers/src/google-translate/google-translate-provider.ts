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
import { createDefaultClient, GOOGLE_TRANSLATE_ENDPOINT_HOST } from "./client.js";
import { type GoogleTranslateConfig, googleTranslateConfigSchema } from "./config.js";
import { chunkTextsForGoogleTranslate } from "./limits.js";
import { assertValidGoogleTranslateLocale } from "./locale-validation.js";
import { PLACEHOLDER_UNSUPPORTED_MESSAGE, partitionByPlaceholders } from "./placeholders.js";
import { buildTranslateNotices } from "./request.js";
import { parseGoogleTranslateHttpResult, zipResults } from "./response.js";
import type {
  GoogleTranslateClient,
  GoogleTranslateClientBundle,
  GoogleTranslateHttpResponse,
  GoogleTranslateResult,
} from "./types.js";

const PROVIDER_ID = "google-translate";

export interface GoogleTranslateDeps {
  readonly client?: GoogleTranslateClient;
}

export function createGoogleTranslateProvider(
  config: GoogleTranslateConfig,
  deps: GoogleTranslateDeps = {},
): TranslationProvider {
  const validConfig = googleTranslateConfigSchema.parse(config);
  const bundle = resolveClient(deps);
  return {
    id: PROVIDER_ID,
    kind: "machine-translation",
    supportsGlossary: false,
    translateBatch: (request: TranslateRequest): Promise<GoogleTranslateResult> =>
      translate(bundle, validConfig, request),
  };
}

function resolveClient(deps: GoogleTranslateDeps): GoogleTranslateClientBundle {
  if (deps.client !== undefined) {
    return { client: deps.client };
  }
  return createDefaultClient();
}

async function translate(
  bundle: GoogleTranslateClientBundle,
  config: GoogleTranslateConfig,
  request: TranslateRequest,
): Promise<GoogleTranslateResult> {
  const data = validateRequest(request);
  assertValidGoogleTranslateLocale(data.sourceLocale, "source");
  assertValidGoogleTranslateLocale(data.targetLocale, "target");
  const { protectable, unprotectable } = partitionByPlaceholders(data.entries);
  const genericGlossarySupplied =
    request.glossary !== undefined && Object.keys(request.glossary).length > 0;
  const notices = buildTranslateNotices({
    ...(data.tone !== undefined ? { tone: data.tone } : {}),
    genericGlossarySupplied,
  });
  const { values, integrity } = await translateProtectable(
    bundle.client,
    data,
    protectable,
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
    ),
    notices,
    [...values.keys()],
  );
  return { values, integrity, notices, reviewFlags };
}

async function translateProtectable(
  client: GoogleTranslateClient,
  data: ValidatedRequestData,
  protectable: readonly TranslationEntry[],
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
  const translatedTexts = await callClientChunked(
    client,
    texts,
    data.sourceLocale,
    data.targetLocale,
    timeoutMs,
    signal,
  );
  const { values, integrityInputs } = zipResults(protectable, translatedTexts);
  const integrity = checkBatchIntegrity(integrityInputs, extract, compare);
  return { values, integrity };
}

function callClient(
  client: GoogleTranslateClient,
  texts: readonly string[],
  sourceLang: string,
  targetLang: string,
  timeoutMs: number,
  signal: AbortSignal | undefined,
): Promise<GoogleTranslateHttpResponse> {
  return withRequestTimeout(
    timeoutMs,
    signal,
    (guardedSignal) => client.translate(texts, sourceLang, targetLang, guardedSignal),
    { endpointHost: GOOGLE_TRANSLATE_ENDPOINT_HOST },
  );
}

async function callClientChunked(
  client: GoogleTranslateClient,
  texts: readonly string[],
  sourceLang: string,
  targetLang: string,
  timeoutMs: number,
  signal: AbortSignal | undefined,
): Promise<string[]> {
  const results: string[] = [];
  for (const chunk of chunkTextsForGoogleTranslate(texts)) {
    const { status, body } = await callClient(
      client,
      chunk,
      sourceLang,
      targetLang,
      timeoutMs,
      signal,
    );
    results.push(...parseGoogleTranslateHttpResult(status, body));
  }
  return results;
}
