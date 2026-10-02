import { appliesTerms } from "../glossary.js";
import { checkBatchIntegrity } from "../integrity.js";
import { resolveProviderLocale } from "../locale-map.js";
import type { ProviderNetwork } from "../network/transport.js";
import {
  decodeMaskedFromHtml,
  encodeMaskedForHtml,
  type MaskedEntry,
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
import { DEFAULT_REQUEST_TIMEOUT_MS, withRequestTimeout } from "../request-timeout.js";
import { applyProviderDegraded, buildEntryReviewFlags } from "../review-flags.js";
import { createDefaultClient } from "./client.js";
import { type GoogleTranslateConfig, googleTranslateConfigSchema } from "./config.js";
import { GOOGLE_TRANSLATE_ENDPOINT_HOST } from "./endpoint.js";
import { chunkTextsForGoogleTranslate } from "./limits.js";
import { toGoogleTranslateCode } from "./locale-codes.js";
import { assertValidGoogleTranslateLocale } from "./locale-validation.js";
import { buildTranslateNotices } from "./request.js";
import { parseGoogleTranslateHttpResult, zipResults } from "./response.js";
import type {
  GoogleTranslateClient,
  GoogleTranslateClientBundle,
  GoogleTranslateResult,
  GoogleTranslateTextFormat,
} from "./types.js";

const PROVIDER_ID = "google-translate";

interface GoogleLanguages {
  readonly sourceLang: string;
  readonly targetLang: string;
}

interface Call {
  readonly client: GoogleTranslateClient;
  readonly languages: GoogleLanguages;
  readonly timeoutMs: number;
  readonly signal: AbortSignal | undefined;
}

export interface GoogleTranslateDeps {
  readonly client?: GoogleTranslateClient;
  readonly network?: ProviderNetwork;
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
  return createDefaultClient(deps.network);
}

async function translate(
  bundle: GoogleTranslateClientBundle,
  config: GoogleTranslateConfig,
  request: TranslateRequest,
): Promise<GoogleTranslateResult> {
  const data = validateRequest(request);
  const languages = resolveGoogleLanguages(config, data);
  const { plain, masked, unprotectable } = partitionForMasking(data.entries, {
    withholdMarkup: true,
  });
  const notices = buildTranslateNotices({
    ...(data.tone !== undefined ? { tone: data.tone } : {}),
    genericGlossarySupplied: appliesTerms(data.glossary),
  });
  const call: Call = {
    client: bundle.client,
    languages,
    timeoutMs: config.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
    signal: request.signal,
  };
  const plainOut = plain.map((entry): OutgoingText => ({ entry, text: entry.value }));
  const maskedOut = encodeForHtml(masked);
  const pairs = [
    ...zipResults(plainOut, await sendGroup(call, plainOut, "text")),
    ...zipResults(maskedOut, await sendGroup(call, maskedOut, "html")),
  ];
  const restored = restoreTranslations(pairs, decodeMaskedFromHtml);
  const integrity = checkBatchIntegrity(
    restored.integrityInputs,
    request.extractPlaceholders,
    request.comparePlaceholders,
  );
  const withheld = unprotectable.length + masked.length - maskedOut.length + restored.lost;
  if (withheld > 0) {
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

function encodeForHtml(masked: readonly MaskedEntry[]): OutgoingText[] {
  return masked.flatMap((item) => {
    const text = encodeMaskedForHtml(item.masked);
    return text === undefined ? [] : [{ entry: item.entry, text, masked: item.masked }];
  });
}

function resolveGoogleLanguages(
  config: GoogleTranslateConfig,
  data: ValidatedRequestData,
): GoogleLanguages {
  const sourceLang = resolveProviderLocale(
    data.sourceLocale,
    config.localeMap,
    toGoogleTranslateCode,
  );
  const targetLang = resolveProviderLocale(
    data.targetLocale,
    config.localeMap,
    toGoogleTranslateCode,
  );
  assertValidGoogleTranslateLocale(sourceLang, "source");
  assertValidGoogleTranslateLocale(targetLang, "target");
  return { sourceLang, targetLang };
}

async function sendGroup(
  call: Call,
  outgoing: readonly OutgoingText[],
  format: GoogleTranslateTextFormat,
): Promise<string[]> {
  const results: string[] = [];
  for (const chunk of chunkTextsForGoogleTranslate(outgoing.map((item) => item.text))) {
    const { status, body } = await withRequestTimeout(
      call.timeoutMs,
      call.signal,
      (guardedSignal) =>
        call.client.translate(
          chunk,
          call.languages.sourceLang,
          call.languages.targetLang,
          format,
          guardedSignal,
        ),
      { endpointHost: GOOGLE_TRANSLATE_ENDPOINT_HOST },
    );
    results.push(...parseGoogleTranslateHttpResult(status, body));
  }
  return results;
}
