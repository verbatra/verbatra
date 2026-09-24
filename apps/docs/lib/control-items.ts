import { type Locale, localizedPath } from "./i18n";

export type ControlItem = {
  readonly key: string;
  readonly evidence: string;
  readonly page: string;
  readonly anchors?: Readonly<Record<Locale, string>>;
};

export type ControlGroup = {
  readonly key: "people" | "correct" | "network";
  readonly items: ReadonlyArray<ControlItem>;
};

export const CONTROL_GROUPS: ReadonlyArray<ControlGroup> = [
  {
    key: "people",
    items: [
      { key: "humanOnly", evidence: 'provider: { id: "none" }', page: "/docs/human-only-workflow" },
      {
        key: "protect",
        evidence: 'humanEdits: "protect"',
        page: "/docs/protecting-human-translations",
      },
      {
        key: "review",
        evidence: "verbatra.provenance.json",
        page: "/docs/the-lock-file",
        anchors: {
          en: "review-decisions",
          de: "review-entscheidungen",
          es: "decisiones-de-revisión",
          fr: "décisions-de-revue",
        },
      },
      {
        key: "glossary",
        evidence: '"version": 2',
        page: "/docs/config-file",
        anchors: {
          en: "per-locale-glossary-version-2",
          de: "glossar-pro-locale-version-2",
          es: "glosario-por-locale-versión-2",
          fr: "glossaire-par-locale-version-2",
        },
      },
    ],
  },
  {
    key: "correct",
    items: [
      {
        key: "plurals",
        evidence: "one, few, many, other",
        page: "/docs/language-support",
        anchors: { en: "plurals", de: "plurale", es: "plurales", fr: "pluriels" },
      },
      {
        key: "locales",
        evidence: "pt-BR, sr-Latn, es-419",
        page: "/docs/language-support",
        anchors: {
          en: "locale-codes",
          de: "locale-codes",
          es: "códigos-de-locale",
          fr: "codes-de-locale",
        },
      },
      {
        key: "qa",
        evidence: "verbatra check --qa",
        page: "/docs/cli/check",
        anchors: {
          en: "quality-check",
          de: "qualitätsprüfung",
          es: "control-de-calidad",
          fr: "contrôle-qualité",
        },
      },
    ],
  },
  {
    key: "network",
    items: [
      {
        key: "policy",
        evidence: 'network: { policy: "local-only" }',
        page: "/docs/network-policy",
      },
      { key: "private", evidence: "openai-compatible", page: "/docs/data-handling" },
    ],
  },
];

export function controlHref(locale: Locale, item: ControlItem): string {
  const anchor = item.anchors?.[locale];
  return localizedPath(locale, anchor === undefined ? item.page : `${item.page}#${anchor}`);
}
