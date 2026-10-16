import type { SupportedFormat } from "@verbatra/sdk";
import { PROVIDER_KEYS_ANCHORS } from "./docs-anchors";
import { FORMAT_SAMPLES, type FormatSample, sampleLines } from "./format-samples";
import { type Locale, type LocalizedAnchors, localizedAnchorPath } from "./i18n";
import { type MachineProviderId, SUPPORTED_FORMAT_IDS } from "./landing-facts";

export type BentoKey = "keys" | "providers" | "formats" | "sdk" | "frameworks";

type BentoDocsLink = {
  readonly page: string;
  readonly anchors?: LocalizedAnchors;
};

type BentoEvidence = BentoDocsLink & { readonly text: string };

export type TileSpan = 5 | 6 | 7 | 8 | 12;

export type BentoTile = {
  readonly key: BentoKey;
  readonly span: { readonly lg: TileSpan; readonly xl?: TileSpan };
  readonly evidence: ReadonlyArray<BentoEvidence>;
};

export const BENTO_TILES: ReadonlyArray<BentoTile> = [
  { key: "keys", span: { lg: 8 }, evidence: [] },
  {
    key: "formats",
    span: { lg: 6, xl: 7 },
    evidence: [
      { text: 'format: "next-intl-json"', page: "/docs/formats" },
      { text: 'format: "custom:toml"', page: "/docs/custom-format-adapters" },
    ],
  },
  { key: "providers", span: { lg: 6, xl: 5 }, evidence: [] },
  {
    key: "sdk",
    span: { lg: 12 },
    evidence: [{ text: "RunSummary", page: "/docs/sdk/run-summary" }],
  },
  { key: "frameworks", span: { lg: 12 }, evidence: [] },
];

export function bentoHref(locale: Locale, link: BentoDocsLink): string {
  return localizedAnchorPath(locale, link.page, link.anchors);
}

export const BENTO_NONE_LINK: BentoDocsLink = { page: "/docs/human-only-workflow" };

export const BENTO_PROVIDER_LINE = 'provider: { id: "<id>" }';

export const BENTO_KEYS_LINK: BentoDocsLink = {
  page: "/docs/providers",
  anchors: PROVIDER_KEYS_ANCHORS,
};

export const BENTO_PROVIDERS_LINK: BentoDocsLink = { page: "/docs/providers" };

export const BENTO_SAFETY_LINK: BentoDocsLink = {
  page: "/docs/translation-safety",
};

type KeyEnvVar = {
  readonly name: string;
  readonly optional: boolean;
  readonly configurable?: boolean;
};

export const BENTO_KEY_ENV_VARS: Readonly<Record<MachineProviderId, KeyEnvVar>> = {
  anthropic: { name: "ANTHROPIC_API_KEY", optional: false },
  openai: { name: "OPENAI_API_KEY", optional: false },
  gemini: { name: "GEMINI_API_KEY", optional: false },
  deepl: { name: "DEEPL_API_KEY", optional: false },
  "google-translate": { name: "GOOGLE_TRANSLATE_API_KEY", optional: false },
  "openai-compatible": { name: "OPENAI_COMPATIBLE_API_KEY", optional: true, configurable: true },
  libretranslate: { name: "LIBRETRANSLATE_API_KEY", optional: true },
};

export const BENTO_RUN_SUMMARY_FIELDS = [
  "readonly dryRun: boolean;",
  "readonly locales: readonly LocaleSummary[];",
  "readonly succeeded: readonly string[];",
  "readonly partial: readonly string[];",
  "readonly failed: readonly string[];",
  "readonly usage?: UsageSummary;",
  "readonly budget?: RunBudget;",
  "readonly estimate?: RunEstimate;",
] as const;

export const BENTO_RUN_SUMMARY_CODE = `const summary = await translate({ config });

interface RunSummary {
${BENTO_RUN_SUMMARY_FIELDS.map((field) => `  ${field}`).join("\n")}
  // excerpt
}
`;

export const BENTO_QUICKSTART_PAGE = "/docs/quickstart";

export const BENTO_FORMAT_KEY = "cart.total";

export const FORMAT_FAMILIES = ["web", "mobile", "backend", "exchange"] as const;

export type FormatFamily = (typeof FORMAT_FAMILIES)[number];

export const FORMAT_FAMILY: Readonly<Record<SupportedFormat, FormatFamily>> = {
  "i18next-json": "web",
  "vue-i18n-json": "web",
  "next-intl-json": "web",
  "ngx-translate-json": "web",
  arb: "mobile",
  "apple-strings": "mobile",
  "apple-xcstrings": "mobile",
  "android-xml": "mobile",
  properties: "backend",
  resx: "backend",
  "gettext-po": "backend",
  ini: "backend",
  xliff: "exchange",
  yaml: "exchange",
};

export function formatsInFamily(family: FormatFamily): ReadonlyArray<SupportedFormat> {
  return SUPPORTED_FORMAT_IDS.filter((format) => FORMAT_FAMILY[format] === family);
}

type BentoFormatLine = {
  readonly format: SupportedFormat;
  readonly file: string;
  readonly placeholder: string;
  readonly line: string;
};

function keyLine(sample: FormatSample): string {
  const line = sampleLines(sample).find((candidate) => candidate.includes(sample.placeholder));
  if (line === undefined) throw new Error(`no ${BENTO_FORMAT_KEY} line in ${sample.file}`);
  return line.trim().replace(/,$/, "");
}

function formatLine(format: SupportedFormat): BentoFormatLine {
  const sample = FORMAT_SAMPLES[format];
  return { format, file: sample.file, placeholder: sample.placeholder, line: keyLine(sample) };
}

export const BENTO_FORMAT_EXAMPLE = formatLine("next-intl-json");
