import { appliesTerms } from "../glossary.js";
import { checkBatchIntegrity } from "../integrity.js";
import { supportsFormality } from "../language-support.js";
import { resolveProviderLocale } from "../locale-map.js";
import {
  decodeMaskedFromXml,
  encodeMaskedForXml,
  type OutgoingText,
  PLACEHOLDER_UNSUPPORTED_MESSAGE,
  partitionForMasking,
  restoreTranslations,
} from "../placeholder-protection.js";
import {
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

interface Call {
  readonly client: DeepLTranslateClient;
  readonly languages: DeepLLanguages;
  readonly timeoutMs: number;
  readonly signal: AbortSignal | undefined;
}

const MASKED_OPTIONS: DeepLTranslateOptions = {
  tagHandling: "xml",
  tagHandlingVersion: "v2",
  ignoreTags: ["x"],
  outlineDetection: false,
};

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
  const { plain, masked, unprotectable } = partitionForMasking(data.entries, {
    withholdMarkup: true,
  });
  const { options, notices } = buildTranslateOptions({
    freeAccount: bundle.freeAccount,
    formalityAvailable: supportsFormality(DEEPL_LANGUAGE_TABLE, languages.targetLang),
    genericGlossarySupplied: appliesTerms(data.glossary),
    ...(data.tone !== undefined ? { tone: data.tone } : {}),
    ...(config.glossaryId !== undefined ? { glossaryId: config.glossaryId } : {}),
  });
  const call: Call = {
    client: bundle.client,
    languages,
    timeoutMs: config.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
    signal: request.signal,
  };
  const plainOut = plain.map((entry): OutgoingText => ({ entry, text: entry.value }));
  const maskedOut = masked.map(
    (item): OutgoingText => ({
      entry: item.entry,
      text: encodeMaskedForXml(item.masked),
      masked: item.masked,
    }),
  );
  const pairs = [
    ...zipResults(plainOut, await sendGroup(call, plainOut, options)),
    ...zipResults(maskedOut, await sendGroup(call, maskedOut, { ...options, ...MASKED_OPTIONS })),
  ];
  const restored = restoreTranslations(pairs, decodeMaskedFromXml);
  const integrity = checkBatchIntegrity(
    restored.integrityInputs,
    request.extractPlaceholders,
    request.comparePlaceholders,
  );
  if (unprotectable.length + restored.lost > 0) {
    notices.push({ code: "PLACEHOLDER_UNSUPPORTED", message: PLACEHOLDER_UNSUPPORTED_MESSAGE });
  }
  const reviewFlags = applyProviderDegraded(
    buildEntryReviewFlags(
      restored.translated,
      restored.values,
      integrity,
      data.sourceLocale,
      data.targetLocale,
      data.glossary,
      data.maxLength,
    ),
    notices,
    [...restored.values.keys()],
  );
  return { values: restored.values, integrity, notices, reviewFlags };
}

function resolveDeepLLanguages(config: DeepLConfig, data: ValidatedRequestData): DeepLLanguages {
  const sourceLang = resolveProviderLocale(data.sourceLocale, config.localeMap, toDeepLSourceCode);
  const targetLang = resolveProviderLocale(data.targetLocale, config.localeMap, toDeepLTargetCode);
  assertValidDeepLSourceLocale(sourceLang, data.sourceLocale);
  assertValidDeepLTargetLocale(targetLang, data.targetLocale);
  return { sourceLang, targetLang };
}

async function sendGroup(
  call: Call,
  outgoing: readonly OutgoingText[],
  options: DeepLTranslateOptions,
): Promise<DeepLTextResult[]> {
  const results: DeepLTextResult[] = [];
  for (const chunk of chunkTextsForDeepL(outgoing.map((item) => item.text))) {
    const chunkResults = await withSdkAttemptTimeout(call.timeoutMs, call.signal, () =>
      call.client.translateText(
        chunk,
        call.languages.sourceLang,
        call.languages.targetLang,
        options,
      ),
    );
    results.push(...chunkResults);
  }
  return results;
}
