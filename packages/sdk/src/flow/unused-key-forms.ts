import type { FormatId } from "@verbatra/core";
import {
  androidPluralBaseKey,
  androidPluralCategoryOf,
  decodePathKey,
  decomposeGettextKey,
} from "@verbatra/format-adapters";

export interface CatalogKeyForms {
  readonly key: string;
  readonly lookups: readonly string[];
}

type KeyDecoder = (catalogKey: string) => CatalogKeyForms;

const GETTEXT_CONTEXT_DISPLAY_SEPARATOR = "|";

const I18NEXT_CONTEXT_SEPARATOR = "_";

function pathEncodedForms(catalogKey: string): CatalogKeyForms {
  const key = decodePathKey(catalogKey);
  return { key, lookups: [key] };
}

function gettextForms(catalogKey: string): CatalogKeyForms {
  let decomposed: ReturnType<typeof decomposeGettextKey>;
  try {
    decomposed = decomposeGettextKey(catalogKey);
  } catch {
    return { key: catalogKey, lookups: [] };
  }
  const { msgctxt, msgid, pluralIndex } = decomposed;
  const base =
    msgctxt === undefined ? msgid : `${msgctxt}${GETTEXT_CONTEXT_DISPLAY_SEPARATOR}${msgid}`;
  const lookup = msgctxt === undefined ? msgid : `${msgid}${I18NEXT_CONTEXT_SEPARATOR}${msgctxt}`;
  return { key: pluralIndex === undefined ? base : `${base}[${pluralIndex}]`, lookups: [lookup] };
}

function androidForms(catalogKey: string): CatalogKeyForms {
  const base = androidPluralBaseKey(catalogKey);
  const category = androidPluralCategoryOf(catalogKey);
  const lookups =
    base === undefined || category === undefined
      ? []
      : [base, `${base}${I18NEXT_CONTEXT_SEPARATOR}${category}`];
  return { key: catalogKey, lookups };
}

const DECODERS: Readonly<Partial<Record<FormatId, KeyDecoder>>> = {
  "i18next-json": pathEncodedForms,
  "vue-i18n-json": pathEncodedForms,
  "next-intl-json": pathEncodedForms,
  "ngx-translate-json": pathEncodedForms,
  yaml: pathEncodedForms,
  arb: pathEncodedForms,
  "gettext-po": gettextForms,
  "android-xml": androidForms,
};

export function catalogKeyForms(format: FormatId, catalogKey: string): CatalogKeyForms {
  const decoded = DECODERS[format]?.(catalogKey) ?? { key: catalogKey, lookups: [] };
  return {
    key: decoded.key,
    lookups: [...new Set([catalogKey, decoded.key, ...decoded.lookups])],
  };
}
