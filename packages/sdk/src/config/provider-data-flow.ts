import type { MachineProviderId } from "./provider-config.js";

/**
 * One kind of data a provider request can carry, as {@link DataFlowSent.fields} lists it.
 *
 * - `key-name`: the translation key, such as `checkout.title`.
 * - `source-text`: the source locale value of a key.
 * - `description`: the description a source file carries for a key, such as an ARB `description`.
 * - `meaning`: the meaning or context a source file carries for a key, such as a gettext `msgctxt`.
 * - `placeholder-markers`: placeholders replaced by numbered markers before the text is sent.
 * - `language-codes`: the source and target codes, after `provider.options.localeMap`.
 * - `language-names`: the English names of the source and target languages.
 * - `tone`: the configured `tone`.
 * - `formality`: a formality setting derived from the configured `tone`.
 * - `glossary-terms`: the target locale's glossary terms, forbidden renderings and notes.
 * - `glossary-id`: the configured `provider.options.glossaryId`, a glossary stored at the provider.
 * - `plural-categories`: the target language's plural categories, for a batch holding plurals.
 * - `instructions`: verbatra's fixed translation instructions.
 * - `model`: the configured model name.
 * - `output-token-limit`: the configured or default limit on the response length.
 */
export type DataFlowField =
  | "key-name"
  | "source-text"
  | "description"
  | "meaning"
  | "placeholder-markers"
  | "language-codes"
  | "language-names"
  | "tone"
  | "formality"
  | "glossary-terms"
  | "glossary-id"
  | "plural-categories"
  | "instructions"
  | "model"
  | "output-token-limit";

/**
 * Whether a provider request carries an API key: `required` for a hosted provider that reads one,
 * `optional` for a self-hosted one that sends it only when its variable is set.
 */
export type DataFlowApiKey = "required" | "optional";

export type LanguageListRequest = "with-key" | "without-key" | "none";

export interface ProviderDataFlow {
  readonly fields: readonly DataFlowField[];
  readonly apiKey: DataFlowApiKey;
  readonly languageList: LanguageListRequest;
}

const LLM_FIELDS: readonly DataFlowField[] = [
  "key-name",
  "source-text",
  "description",
  "meaning",
  "language-codes",
  "language-names",
  "tone",
  "glossary-terms",
  "plural-categories",
  "instructions",
  "model",
  "output-token-limit",
];

const HOSTED_LLM: ProviderDataFlow = {
  fields: LLM_FIELDS,
  apiKey: "required",
  languageList: "none",
};

type ProviderDataFlowTable = { [K in MachineProviderId]: ProviderDataFlow };

export const PROVIDER_DATA_FLOW: ProviderDataFlowTable = {
  anthropic: HOSTED_LLM,
  openai: HOSTED_LLM,
  gemini: HOSTED_LLM,
  deepl: {
    fields: ["source-text", "placeholder-markers", "language-codes", "formality", "glossary-id"],
    apiKey: "required",
    languageList: "with-key",
  },
  "google-translate": {
    fields: ["source-text", "placeholder-markers", "language-codes"],
    apiKey: "required",
    languageList: "with-key",
  },
  "openai-compatible": { fields: LLM_FIELDS, apiKey: "optional", languageList: "none" },
  libretranslate: {
    fields: ["source-text", "placeholder-markers", "language-codes"],
    apiKey: "optional",
    languageList: "without-key",
  },
};

export function dataFlowOf(id: MachineProviderId): ProviderDataFlow {
  return PROVIDER_DATA_FLOW[id];
}
