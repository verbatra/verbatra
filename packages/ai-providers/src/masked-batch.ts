import { ProviderError } from "./errors.js";
import { checkBatchIntegrity } from "./integrity.js";
import {
  type MaskedEntry,
  type MaskedValue,
  type MaskingOptions,
  type OutgoingText,
  PLACEHOLDER_UNSUPPORTED_MESSAGE,
  partitionForMasking,
  restoreTranslations,
  type WireDecoder,
  withForeignPlaceholders,
} from "./placeholder-protection.js";
import type {
  ProviderNotice,
  TranslateRequest,
  TranslateResult,
  ValidatedRequestData,
} from "./provider.js";
import { applyProviderDegraded, buildEntryReviewFlags } from "./review-flags.js";

const MISMATCH_MESSAGE = "The provider returned a mismatched number of translations.";

export function zipTranslations<T>(
  items: readonly T[],
  translated: readonly string[],
): ReadonlyArray<readonly [T, string]> {
  if (translated.length !== items.length) {
    throw new ProviderError("INVALID_RESPONSE", MISMATCH_MESSAGE);
  }
  const pairs: Array<readonly [T, string]> = [];
  for (const [index, item] of items.entries()) {
    const text = translated[index];
    if (text === undefined) {
      throw new ProviderError("INVALID_RESPONSE", MISMATCH_MESSAGE);
    }
    pairs.push([item, text]);
  }
  return pairs;
}

export interface MaskedBatchStrategy<G extends string> {
  readonly masking: MaskingOptions;
  readonly encode: (masked: MaskedValue) => string | undefined;
  readonly decode: WireDecoder;
  readonly groups: readonly G[];
  readonly groupOf: (item: OutgoingText) => G;
  readonly send: (texts: readonly string[], group: G) => Promise<readonly string[]>;
}

export type MaskedBatchResult = TranslateResult & {
  readonly notices: readonly ProviderNotice[];
};

function encodeAll(
  masked: readonly MaskedEntry[],
  encode: (masked: MaskedValue) => string | undefined,
): OutgoingText[] {
  return masked.flatMap((item) => {
    const text = encode(item.masked);
    return text === undefined ? [] : [{ entry: item.entry, text, masked: item.masked }];
  });
}

async function sendGrouped<G extends string>(
  outgoing: readonly OutgoingText[],
  strategy: MaskedBatchStrategy<G>,
): Promise<ReadonlyArray<readonly [OutgoingText, string]>> {
  const translated = outgoing.map(() => "");
  for (const group of strategy.groups) {
    const members = outgoing.flatMap((item, index) =>
      strategy.groupOf(item) === group ? [{ index, text: item.text }] : [],
    );
    if (members.length === 0) {
      continue;
    }
    const texts = await strategy.send(
      members.map((member) => member.text),
      group,
    );
    for (const [member, text] of zipTranslations(members, texts)) {
      translated[member.index] = text;
    }
  }
  return zipTranslations(outgoing, translated);
}

export async function translateMaskedBatch<G extends string>(
  data: ValidatedRequestData,
  request: TranslateRequest,
  notices: readonly ProviderNotice[],
  strategy: MaskedBatchStrategy<G>,
): Promise<MaskedBatchResult> {
  const { plain, masked, unprotectable } = partitionForMasking(
    withForeignPlaceholders(data.entries, data.foreignPlaceholders),
    strategy.masking,
  );
  const encoded = encodeAll(masked, strategy.encode);
  const outgoing = [
    ...plain.map((entry): OutgoingText => ({ entry, text: entry.value })),
    ...encoded,
  ];
  const restored = restoreTranslations(await sendGrouped(outgoing, strategy), strategy.decode);
  const integrity = checkBatchIntegrity(
    restored.integrityInputs,
    request.extractPlaceholders,
    request.comparePlaceholders,
  );
  const withheld = unprotectable.length + masked.length - encoded.length + restored.lost;
  const allNotices: ProviderNotice[] = [...notices];
  if (withheld > 0) {
    allNotices.push({ code: "PLACEHOLDER_UNSUPPORTED", message: PLACEHOLDER_UNSUPPORTED_MESSAGE });
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
    allNotices,
    [...restored.values.keys()],
  );
  return { values: restored.values, integrity, notices: allNotices, reviewFlags };
}
