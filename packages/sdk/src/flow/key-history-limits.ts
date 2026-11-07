import type { SupportedFormat } from "@verbatra/core";

const KIB = 1024;
const MIB = 1024 * KIB;

type FormatClass = "slow" | "fast";

const FORMAT_CLASS: Readonly<Record<SupportedFormat, FormatClass>> = {
  "i18next-json": "fast",
  "vue-i18n-json": "fast",
  "next-intl-json": "fast",
  "ngx-translate-json": "fast",
  xliff: "slow",
  yaml: "slow",
  arb: "fast",
  properties: "fast",
  "apple-strings": "slow",
  "apple-xcstrings": "fast",
  "android-xml": "slow",
  "gettext-po": "fast",
  ini: "fast",
  resx: "slow",
};

const LOCALE_FILE_CAP: Readonly<Record<FormatClass, number>> = {
  slow: 512 * KIB,
  fast: 4 * MIB,
};

const LOCALE_BYTE_BUDGET: Readonly<Record<FormatClass, number>> = {
  slow: 16 * MIB,
  fast: 128 * MIB,
};

export const RECORD_FILE_CAP = 4 * MIB;
const RECORD_BYTE_BUDGET = 128 * MIB;

export interface ByteLimits {
  readonly fileCap: number;
  readonly budget: number;
}

export function localeLimits(format: SupportedFormat): ByteLimits {
  const formatClass = FORMAT_CLASS[format];
  return { fileCap: LOCALE_FILE_CAP[formatClass], budget: LOCALE_BYTE_BUDGET[formatClass] };
}

export const RECORD_LIMITS: ByteLimits = {
  fileCap: RECORD_FILE_CAP,
  budget: RECORD_BYTE_BUDGET,
};

export type ReadDecision = "read" | "nothing" | "over-cap" | "cut";

export function planReads(
  sizes: readonly (number | null | undefined)[],
  limits: ByteLimits,
): ReadDecision[] {
  let spent = 0;
  let cut = false;
  return sizes.map((size) => {
    if (cut || size === undefined) {
      cut = true;
      return "cut";
    }
    if (size === null) {
      return "nothing";
    }
    if (size > limits.fileCap) {
      return "over-cap";
    }
    if (spent + size > limits.budget) {
      cut = true;
      return "cut";
    }
    spent += size;
    return "read";
  });
}
