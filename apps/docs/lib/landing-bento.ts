import type { SupportedFormat } from "@verbatra/sdk";
import { FORMAT_SAMPLES, type FormatSample, sampleLines } from "./format-samples";
import { GATE_LOCK_HASHES } from "./gate-demo";
import { type Locale, type LocalizedAnchors, localizedAnchorPath } from "./i18n";

export type BentoKey =
  | "incremental"
  | "integrity"
  | "providers"
  | "keys"
  | "action"
  | "formats"
  | "adapters";

export type BentoEvidence = {
  readonly text: string;
  readonly page: string;
  readonly anchors?: LocalizedAnchors;
};

export type BentoTile = {
  readonly key: BentoKey;
  readonly span: 4 | 5 | 7;
  readonly evidence: ReadonlyArray<BentoEvidence>;
};

export const BENTO_TILES: ReadonlyArray<BentoTile> = [
  {
    key: "incremental",
    span: 7,
    evidence: [
      { text: "verbatra.lock.json", page: "/docs/the-lock-file" },
      { text: "verbatra translate --dry-run", page: "/docs/cli/translate" },
      { text: 'humanEdits: "protect"', page: "/docs/protecting-human-translations" },
    ],
  },
  {
    key: "integrity",
    span: 5,
    evidence: [
      { text: "integrity-withheld", page: "/docs/translation-safety" },
      {
        text: "verbatra check --qa",
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
    key: "providers",
    span: 5,
    evidence: [
      { text: 'provider: { id: "none" }', page: "/docs/human-only-workflow" },
      {
        text: 'provider: { id: "gemini", options: { model: "gemini-2.5-flash", maxOutputTokens: 4096 } }',
        page: "/docs/providers",
      },
    ],
  },
  {
    key: "formats",
    span: 7,
    evidence: [{ text: 'format: "next-intl-json"', page: "/docs/formats" }],
  },
  {
    key: "keys",
    span: 4,
    evidence: [
      { text: 'network: { policy: "local-only" }', page: "/docs/network-policy" },
      { text: "openai-compatible", page: "/docs/data-handling" },
    ],
  },
  {
    key: "action",
    span: 4,
    evidence: [{ text: "verbatra/action@v1", page: "/docs/github-action" }],
  },
  {
    key: "adapters",
    span: 4,
    evidence: [{ text: 'format: "custom:toml"', page: "/docs/custom-format-adapters" }],
  },
];

export function bentoHref(locale: Locale, evidence: BentoEvidence): string {
  return localizedAnchorPath(locale, evidence.page, evidence.anchors);
}

export const BENTO_LOCK_LOCALE = "de";

export const BENTO_LOCK_CODE = `${JSON.stringify(
  { version: 1, locales: { [BENTO_LOCK_LOCALE]: GATE_LOCK_HASHES } },
  null,
  2,
)}\n`;

export const BENTO_KEY_ENV_VAR = "GEMINI_API_KEY";

export const BENTO_KEYS_CODE = `export ${BENTO_KEY_ENV_VAR}=your-key
npx @verbatra/cli translate
`;

export const BENTO_ADAPTER_IMPORTS = ["createDefaultRegistry", "translate"] as const;

export const BENTO_ADAPTER_CODE = `import { ${BENTO_ADAPTER_IMPORTS.join(", ")} } from "@verbatra/sdk";

const adapterRegistry = createDefaultRegistry().register(tomlAdapter);
await translate({ config }, { adapterRegistry });
`;

export type BentoActionTrigger = { readonly event: string; readonly command: string };

export const BENTO_ACTION_TRIGGERS: ReadonlyArray<BentoActionTrigger> = [
  { event: "pull_request", command: "check" },
  { event: "push", command: "translate" },
];

export const BENTO_ACTION_ANNOTATION = "verbatra check: de";

export const BENTO_ACTION_FILE = ".github/workflows/i18n.yml";

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

export const BENTO_FORMAT_IDS: ReadonlyArray<SupportedFormat> = [
  "next-intl-json",
  "android-xml",
  "apple-strings",
  "arb",
];

export type BentoFormatLine = {
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
