import type { PlaceholderIntegrityResult, TranslationEntry } from "@verbatra/core";
import { endpointContextOf } from "../base-url.js";
import { appliesTerms } from "../glossary.js";
import type { ProviderCallContext } from "../guard.js";
import { checkBatchIntegrity, type IntegrityInput } from "../integrity.js";
import { resolveProviderLocale } from "../locale-map.js";
import type { ProviderNetwork } from "../network/transport.js";
import {
  containsMarkupTag,
  type MaskedValue,
  partitionForMasking,
  unmaskPlaceholders,
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
import { type LibreTranslateConfig, libreTranslateConfigSchema } from "./config.js";
import { toLibreTranslateCode } from "./locale-codes.js";
import { buildTranslateNotices, PLACEHOLDER_UNSUPPORTED_MESSAGE } from "./notices.js";
import { parseLibreTranslateHttpResult, zipTexts } from "./response.js";
import type {
  LibreTranslateClient,
  LibreTranslateClientBundle,
  LibreTranslateResult,
  LibreTranslateTextFormat,
} from "./types.js";

const PROVIDER_ID = "libretranslate";

interface OutgoingText {
  readonly entry: TranslationEntry;
  readonly text: string;
  readonly masked?: MaskedValue;
}

interface Call {
  readonly bundle: LibreTranslateClientBundle;
  readonly sourceLang: string;
  readonly targetLang: string;
  readonly timeoutMs: number;
  readonly context: ProviderCallContext | undefined;
  readonly signal: AbortSignal | undefined;
}

interface Restored {
  readonly values: Map<string, string>;
  readonly integrityInputs: IntegrityInput[];
  readonly translated: TranslationEntry[];
  readonly lost: number;
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
  const { plain, masked, unprotectable } = partitionForMasking(data.entries, { keepMarkup: true });
  const outgoing: OutgoingText[] = [
    ...plain.map((entry) => ({ entry, text: entry.value })),
    ...masked.map((item) => ({ entry: item.entry, text: item.masked.text, masked: item.masked })),
  ];
  const call: Call = {
    bundle,
    sourceLang: languageOf(data.sourceLocale, config),
    targetLang: languageOf(data.targetLocale, config),
    timeoutMs: config.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
    context,
    signal: request.signal,
  };
  const restored = restore(outgoing, await send(call, outgoing));
  const integrity = checkBatchIntegrity(
    restored.integrityInputs,
    request.extractPlaceholders,
    request.comparePlaceholders,
  );
  return assembleResult(data, restored, integrity, unprotectable.length + restored.lost);
}

function formatOf(item: OutgoingText): LibreTranslateTextFormat {
  return containsMarkupTag(item.text) ? "html" : "text";
}

const TEXT_FORMATS: readonly LibreTranslateTextFormat[] = ["text", "html"];

async function sendGroup(
  call: Call,
  texts: readonly string[],
  format: LibreTranslateTextFormat,
): Promise<readonly string[]> {
  if (texts.length === 0) {
    return [];
  }
  const { status, body } = await withRequestTimeout(
    call.timeoutMs,
    call.signal,
    (signal) =>
      call.bundle.client.translate(texts, call.sourceLang, call.targetLang, format, signal),
    call.context,
  );
  return parseLibreTranslateHttpResult(status, body, call.bundle.keyConfigured);
}

async function send(call: Call, outgoing: readonly OutgoingText[]): Promise<readonly string[]> {
  const translated = outgoing.map(() => "");
  for (const format of TEXT_FORMATS) {
    const group = outgoing.flatMap((item, index) =>
      formatOf(item) === format ? [{ index, text: item.text }] : [],
    );
    const texts = await sendGroup(
      call,
      group.map((item) => item.text),
      format,
    );
    for (const [item, text] of zipTexts(group, texts)) {
      translated[item.index] = text;
    }
  }
  return translated;
}

function restore(outgoing: readonly OutgoingText[], translated: readonly string[]): Restored {
  const values = new Map<string, string>();
  const integrityInputs: IntegrityInput[] = [];
  const kept: TranslationEntry[] = [];
  let lost = 0;
  for (const [item, text] of zipTexts(outgoing, translated)) {
    const value = item.masked === undefined ? text : unmaskPlaceholders(text, item.masked);
    if (value === undefined) {
      lost += 1;
      continue;
    }
    values.set(item.entry.key, value);
    integrityInputs.push({
      key: item.entry.key,
      sourceValue: item.entry.value,
      translatedValue: value,
    });
    kept.push(item.entry);
  }
  return { values, integrityInputs, translated: kept, lost };
}

function assembleResult(
  data: ValidatedRequestData,
  restored: Restored,
  integrity: ReadonlyMap<string, PlaceholderIntegrityResult>,
  withheld: number,
): LibreTranslateResult {
  const notices = buildTranslateNotices({
    ...(data.tone !== undefined ? { tone: data.tone } : {}),
    genericGlossarySupplied: appliesTerms(data.glossary),
  });
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
