import { endpointContextOf } from "../base-url.js";
import { appliesTerms } from "../glossary.js";
import type { ProviderCallContext } from "../guard.js";
import { resolveProviderLocale } from "../locale-map.js";
import { translateMaskedBatch } from "../masked-batch.js";
import type { ProviderNetwork } from "../network/transport.js";
import { containsMarkupTag } from "../placeholder-protection.js";
import { type TranslateRequest, type TranslationProvider, validateRequest } from "../provider.js";
import { DEFAULT_REQUEST_TIMEOUT_MS, withRequestTimeout } from "../request-timeout.js";
import { createDefaultClient } from "./client.js";
import { type LibreTranslateConfig, libreTranslateConfigSchema } from "./config.js";
import { toLibreTranslateCode } from "./locale-codes.js";
import { buildTranslateNotices } from "./notices.js";
import { parseLibreTranslateHttpResult } from "./response.js";
import type {
  LibreTranslateClient,
  LibreTranslateClientBundle,
  LibreTranslateResult,
  LibreTranslateTextFormat,
} from "./types.js";

const PROVIDER_ID = "libretranslate";

interface Call {
  readonly bundle: LibreTranslateClientBundle;
  readonly sourceLang: string;
  readonly targetLang: string;
  readonly timeoutMs: number;
  readonly context: ProviderCallContext | undefined;
  readonly signal: AbortSignal | undefined;
}

export interface LibreTranslateDeps {
  readonly client?: LibreTranslateClient;
  readonly keyConfigured?: boolean;
  readonly network?: ProviderNetwork;
}

export function createLibreTranslateProvider(
  config: LibreTranslateConfig,
  deps: LibreTranslateDeps = {},
): TranslationProvider {
  const validConfig = libreTranslateConfigSchema.parse(config);
  const bundle = resolveClient(validConfig, deps);
  const context = endpointContextOf(validConfig.baseUrl);
  return {
    id: PROVIDER_ID,
    kind: "machine-translation",
    supportsGlossary: false,
    translateBatch: (request: TranslateRequest): Promise<LibreTranslateResult> =>
      translate(bundle, validConfig, context, request),
  };
}

function resolveClient(
  config: LibreTranslateConfig,
  deps: LibreTranslateDeps,
): LibreTranslateClientBundle {
  if (deps.client !== undefined) {
    return { client: deps.client, keyConfigured: deps.keyConfigured ?? false };
  }
  return createDefaultClient(config.baseUrl, deps.network);
}

function languageOf(locale: string, config: LibreTranslateConfig): string {
  return resolveProviderLocale(locale, config.localeMap, toLibreTranslateCode);
}

async function translate(
  bundle: LibreTranslateClientBundle,
  config: LibreTranslateConfig,
  context: ProviderCallContext | undefined,
  request: TranslateRequest,
): Promise<LibreTranslateResult> {
  const data = validateRequest(request);
  const call: Call = {
    bundle,
    sourceLang: languageOf(data.sourceLocale, config),
    targetLang: languageOf(data.targetLocale, config),
    timeoutMs: config.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
    context,
    signal: request.signal,
  };
  const notices = buildTranslateNotices({
    ...(data.tone !== undefined ? { tone: data.tone } : {}),
    genericGlossarySupplied: appliesTerms(data.glossary),
  });
  return translateMaskedBatch<LibreTranslateTextFormat>(data, request, notices, {
    masking: { keepMarkup: true },
    encode: (masked) => masked.text,
    decode: (text) => text,
    groups: ["text", "html"],
    groupOf: (item) => (containsMarkupTag(item.text) ? "html" : "text"),
    send: (texts, format) => sendGroup(call, texts, format),
  });
}

async function sendGroup(
  call: Call,
  texts: readonly string[],
  format: LibreTranslateTextFormat,
): Promise<readonly string[]> {
  const { status, body } = await withRequestTimeout(
    call.timeoutMs,
    call.signal,
    (signal) =>
      call.bundle.client.translate(texts, call.sourceLang, call.targetLang, format, signal),
    call.context,
  );
  return parseLibreTranslateHttpResult(status, body, call.bundle.keyConfigured);
}
