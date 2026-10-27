import type { TranslationEntry } from "@verbatra/core";
import {
  decodeMaskedFromHtml,
  decodeMaskedFromXml,
  encodeMaskedForHtml,
  encodeMaskedForXml,
} from "./masked-wire-codec.js";
import {
  type MaskedValue,
  type MaskingOptions,
  partitionForMasking,
  type WireDecoder,
  withForeignPlaceholders,
} from "./placeholder-protection.js";

export interface MaskedWire {
  readonly masking: MaskingOptions;
  readonly encode: (masked: MaskedValue) => string | undefined;
  readonly decode: WireDecoder;
}

export type MaskingProviderId = "deepl" | "google-translate" | "libretranslate";

export const MASKED_WIRES: Readonly<Record<MaskingProviderId, MaskedWire>> = {
  deepl: {
    masking: { withholdMarkup: true },
    encode: encodeMaskedForXml,
    decode: decodeMaskedFromXml,
  },
  "google-translate": {
    masking: { withholdMarkup: true },
    encode: encodeMaskedForHtml,
    decode: decodeMaskedFromHtml,
  },
  libretranslate: {
    masking: { keepMarkup: true },
    encode: (masked) => masked.text,
    decode: (text) => text,
  },
};

export function isMaskingProvider(id: string): id is MaskingProviderId {
  return Object.hasOwn(MASKED_WIRES, id);
}

export function entriesWithheldByMasking(
  provider: MaskingProviderId,
  entries: readonly TranslationEntry[],
  foreign?: ReadonlyMap<string, readonly string[]>,
): readonly TranslationEntry[] {
  const wire = MASKED_WIRES[provider];
  const { masked, unprotectable } = partitionForMasking(
    withForeignPlaceholders(entries, foreign),
    wire.masking,
  );
  return [
    ...unprotectable,
    ...masked.flatMap((item) => (wire.encode(item.masked) === undefined ? [item.entry] : [])),
  ];
}
