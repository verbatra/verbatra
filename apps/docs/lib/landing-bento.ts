import type { SupportedFormat } from "@verbatra/sdk";
import { FORMAT_SAMPLES, type FormatSample, sampleLines } from "./format-samples";
import { type Locale, type LocalizedAnchors, localizedAnchorPath } from "./i18n";
import type { MachineProviderId } from "./landing-facts";

export type BentoKey = "providers" | "keys" | "formats" | "sdk" | "frameworks";

type BentoDocsLink = {
  readonly page: string;
  readonly anchors?: LocalizedAnchors;
};

type BentoEvidence = BentoDocsLink & { readonly text: string };

export type BentoTile = {
  readonly key: BentoKey;
  readonly span: 4 | 6 | 8 | 12;
  readonly evidence: ReadonlyArray<BentoEvidence>;
};

export const BENTO_TILES: ReadonlyArray<BentoTile> = [
  {
    key: "providers",
    span: 8,
    evidence: [
      {
        text: 'provider: { id: "gemini", options: { model: "gemini-2.5-flash", maxOutputTokens: 4096 } }',
        page: "/docs/providers",
      },
    ],
  },
  { key: "keys", span: 4, evidence: [] },
  {
    key: "formats",
    span: 6,
    evidence: [
      { text: 'format: "next-intl-json"', page: "/docs/formats" },
      { text: 'format: "custom:toml"', page: "/docs/custom-format-adapters" },
    ],
  },
  { key: "sdk", span: 6, evidence: [{ text: "RunSummary", page: "/docs/sdk/run-summary" }] },
  { key: "frameworks", span: 12, evidence: [] },
];

export function bentoHref(locale: Locale, link: BentoDocsLink): string {
  return localizedAnchorPath(locale, link.page, link.anchors);
}

export const BENTO_NONE_PROVIDER: BentoEvidence = {
  text: 'provider: { id: "none" }',
  page: "/docs/human-only-workflow",
};

export const BENTO_KEYS_LINK: BentoDocsLink = {
  page: "/docs/providers",
  anchors: {
    en: "keys-come-from-the-environment",
    de: "keys-kommen-aus-der-umgebung",
    es: "las-claves-vienen-del-entorno",
    fr: "les-clés-viennent-de-lenvironnement",
  },
};

export const BENTO_SAFETY_LINK: BentoDocsLink = {
  page: "/docs/translation-safety",
};

type KeyEnvVar = { readonly name: string; readonly optional: boolean };

export const BENTO_KEY_ENV_VARS: Readonly<Record<MachineProviderId, KeyEnvVar>> = {
  anthropic: { name: "ANTHROPIC_API_KEY", optional: false },
  openai: { name: "OPENAI_API_KEY", optional: false },
  gemini: { name: "GEMINI_API_KEY", optional: false },
  deepl: { name: "DEEPL_API_KEY", optional: false },
  "google-translate": { name: "GOOGLE_TRANSLATE_API_KEY", optional: false },
  "openai-compatible": { name: "OPENAI_COMPATIBLE_API_KEY", optional: true },
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
}
`;

export const BENTO_QUICKSTART_PAGE = "/docs/quickstart";

export type BentoDiffLine = { readonly sign: " " | "-" | "+"; readonly text: string };

export const BENTO_PROVIDER_FROM = {
  id: "gemini",
  options: { model: "gemini-2.5-flash", maxOutputTokens: 4096 },
} as const;

export const BENTO_PROVIDER_TO = { id: "deepl", options: {} } as const;

function providerLines(provider: { readonly id: string; readonly options: object }): string[] {
  const options = Object.entries(provider.options).map(
    ([key, value]) => `    ${key}: ${JSON.stringify(value)},`,
  );
  const block = options.length === 0 ? ["  options: {},"] : ["  options: {", ...options, "  },"];
  return [`  id: "${provider.id}",`, ...block];
}

export const BENTO_PROVIDER_DIFF: ReadonlyArray<BentoDiffLine> = [
  { sign: " ", text: "provider: {" },
  ...providerLines(BENTO_PROVIDER_FROM).map((text) => ({ sign: "-" as const, text })),
  ...providerLines(BENTO_PROVIDER_TO).map((text) => ({ sign: "+" as const, text })),
  { sign: " ", text: "}," },
];

export const BENTO_FORMAT_KEY = "cart.total";

const BENTO_FORMAT_IDS: ReadonlyArray<SupportedFormat> = [
  "next-intl-json",
  "android-xml",
  "apple-strings",
  "arb",
];

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

export const BENTO_FORMAT_LINES: ReadonlyArray<BentoFormatLine> = BENTO_FORMAT_IDS.map((format) => {
  const sample = FORMAT_SAMPLES[format];
  return { format, file: sample.file, placeholder: sample.placeholder, line: keyLine(sample) };
});
