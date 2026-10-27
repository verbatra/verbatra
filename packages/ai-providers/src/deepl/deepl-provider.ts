import { appliesTerms } from "../glossary.js";
import { supportsFormality } from "../language-support.js";
import { resolveProviderLocale } from "../locale-map.js";
import { translateMaskedBatch } from "../masked-batch.js";
import { MASKED_WIRES } from "../masked-wire.js";
import {
  type TranslateRequest,
  type TranslationProvider,
  type ValidatedRequestData,
  validateRequest,
} from "../provider.js";
import { DEFAULT_REQUEST_TIMEOUT_MS, withSdkAttemptTimeout } from "../request-timeout.js";
import { createDefaultClient } from "./client.js";
import { type DeepLConfig, deepLConfigSchema } from "./config.js";
import { DEEPL_LANGUAGE_TABLE } from "./languages.js";
import { chunkTextsForDeepL } from "./limits.js";
import { toDeepLSourceCode, toDeepLTargetCode } from "./locale-codes.js";
import { assertValidDeepLSourceLocale, assertValidDeepLTargetLocale } from "./locale-validation.js";
import { buildTranslateOptions } from "./request.js";
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
  return translateMaskedBatch(data, request, notices, {
    ...MASKED_WIRES.deepl,
    groups: ["plain", "masked"],
    groupOf: (item) => (item.masked === undefined ? "plain" : "masked"),
    send: (texts, group) =>
      sendChunked(call, texts, group === "plain" ? options : { ...options, ...MASKED_OPTIONS }),
  });
}

function resolveDeepLLanguages(config: DeepLConfig, data: ValidatedRequestData): DeepLLanguages {
  const sourceLang = resolveProviderLocale(data.sourceLocale, config.localeMap, toDeepLSourceCode);
  const targetLang = resolveProviderLocale(data.targetLocale, config.localeMap, toDeepLTargetCode);
  assertValidDeepLSourceLocale(sourceLang, data.sourceLocale);
  assertValidDeepLTargetLocale(targetLang, data.targetLocale);
  return { sourceLang, targetLang };
}

async function sendChunked(
  call: Call,
  texts: readonly string[],
  options: DeepLTranslateOptions,
): Promise<string[]> {
  const results: DeepLTextResult[] = [];
  for (const chunk of chunkTextsForDeepL(texts)) {
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
  return results.map((result) => result.text);
}
