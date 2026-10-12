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
    span: 4,
    evidence: [
      { text: 'provider: { id: "none" }', page: "/docs/human-only-workflow" },
      { text: 'provider: { id: "gemini" }', page: "/docs/providers" },
    ],
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
    key: "formats",
    span: 5,
    evidence: [{ text: 'format: "next-intl-json"', page: "/docs/formats" }],
  },
  {
    key: "adapters",
    span: 7,
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
