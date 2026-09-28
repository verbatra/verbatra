import {
  type LocaleStyle,
  type ProviderId,
  type ScaffoldableProviderId,
  type SupportedFormat,
  scaffoldingMetadata,
} from "@verbatra/sdk";

export const HUMAN_ONLY_PROVIDER = scaffoldingMetadata.humanOnlyProviderId;

export const OPENAI_COMPATIBLE_PROVIDER = "openai-compatible" satisfies ProviderId;

export type InitProviderId =
  | ScaffoldableProviderId
  | typeof OPENAI_COMPATIBLE_PROVIDER
  | typeof HUMAN_ONLY_PROVIDER;

export const INIT_PROVIDER_IDS: readonly InitProviderId[] = [
  ...(Object.keys(scaffoldingMetadata.providerEnv) as ScaffoldableProviderId[]),
  OPENAI_COMPATIBLE_PROVIDER,
  HUMAN_ONLY_PROVIDER,
];

export const DEFAULT_MODEL = scaffoldingMetadata.scaffoldModels;

export const TOKEN_LIMIT = 4096;

export interface DefaultLayout {
  readonly pattern: string;
  readonly localeStyle: LocaleStyle;
}

export const DEFAULT_LAYOUTS: Readonly<Record<SupportedFormat, DefaultLayout>> = {
  "i18next-json": { pattern: "locales/{locale}.json", localeStyle: "literal" },
  "vue-i18n-json": { pattern: "src/locales/{locale}.json", localeStyle: "literal" },
  "next-intl-json": { pattern: "messages/{locale}.json", localeStyle: "literal" },
  "ngx-translate-json": { pattern: "src/assets/i18n/{locale}.json", localeStyle: "literal" },
  xliff: { pattern: "locales/{locale}.xlf", localeStyle: "literal" },
  yaml: { pattern: "locales/{locale}.yml", localeStyle: "literal" },
  arb: { pattern: "lib/l10n/app_{locale}.arb", localeStyle: "posix" },
  properties: {
    pattern: "src/main/resources/messages_{locale}.properties",
    localeStyle: "posix",
  },
  "apple-strings": { pattern: "{locale}.lproj/Localizable.strings", localeStyle: "literal" },
  "apple-xcstrings": { pattern: "{locale}Localizable.xcstrings", localeStyle: "literal" },
  "android-xml": { pattern: "app/src/main/res/{locale}/strings.xml", localeStyle: "android" },
  "gettext-po": { pattern: "locales/{locale}/LC_MESSAGES/messages.po", localeStyle: "posix" },
  ini: { pattern: "locales/{locale}.ini", localeStyle: "literal" },
  resx: { pattern: "Resources/Strings.{locale}.resx", localeStyle: "literal" },
};

export type FormatOrigin = "files" | "dependencies" | "flag" | "prompt" | "default";

export interface ProviderChoice {
  readonly id: InitProviderId;
  readonly model?: string;
  readonly baseUrl?: string;
  readonly apiKeyEnvVar?: string;
}

export interface ConfigDraft {
  readonly importName: string;
  readonly sourceLocale: string;
  readonly targetLocales: readonly string[];
  readonly format: SupportedFormat;
  readonly formatOrigin: FormatOrigin;
  readonly pattern: string;
  readonly localeStyle: LocaleStyle | undefined;
  readonly provider: ProviderChoice;
}

type ModelProviderId = keyof typeof scaffoldingMetadata.scaffoldModels;

export function isInitProviderId(value: string): value is InitProviderId {
  return (INIT_PROVIDER_IDS as readonly string[]).includes(value);
}

export function isModelProvider(id: InitProviderId): id is ModelProviderId {
  return Object.hasOwn(scaffoldingMetadata.scaffoldModels, id);
}

export function takesModel(id: InitProviderId): boolean {
  return isModelProvider(id) || id === OPENAI_COMPATIBLE_PROVIDER;
}

export function buildProviderOptions(choice: ProviderChoice): Record<string, unknown> {
  if (choice.id === OPENAI_COMPATIBLE_PROVIDER) {
    return {
      baseUrl: choice.baseUrl,
      model: choice.model,
      maxOutputTokens: TOKEN_LIMIT,
      ...(choice.apiKeyEnvVar === undefined ? {} : { apiKeyEnvVar: choice.apiKeyEnvVar }),
    };
  }
  if (!isModelProvider(choice.id)) {
    return {};
  }
  return {
    model: choice.model ?? DEFAULT_MODEL[choice.id],
    [scaffoldingMetadata.providerTokenLimitKeys[choice.id]]: TOKEN_LIMIT,
  };
}

export function keyEnvVarFor(choice: ProviderChoice): string | undefined {
  if (choice.id === HUMAN_ONLY_PROVIDER) {
    return undefined;
  }
  if (choice.id === OPENAI_COMPATIBLE_PROVIDER) {
    return choice.apiKeyEnvVar ?? scaffoldingMetadata.openAiCompatibleKeyEnv;
  }
  return scaffoldingMetadata.providerEnv[choice.id];
}

export function isOptionalKey(choice: ProviderChoice): boolean {
  return choice.id === OPENAI_COMPATIBLE_PROVIDER && choice.apiKeyEnvVar === undefined;
}

const NO_MODEL_NOTES: Readonly<Partial<Record<InitProviderId, string>>> = {
  deepl: "    // DeepL needs no model; add an optional glossaryId here if you have one.",
  "google-translate": "    // Google Cloud Translation needs no model.",
  "openai-compatible":
    "    // A local or self-hosted server that speaks the OpenAI chat completions API.",
};

function optionComment(key: string, choice: ProviderChoice): string | undefined {
  if (key === "model" && isModelProvider(choice.id) && choice.model === undefined) {
    return "      // A sensible default; change to any model this provider supports.";
  }
  if (key === "apiKeyEnvVar") {
    return "      // The environment variable holding the key; the key itself never goes in this file.";
  }
  return undefined;
}

function literal(value: unknown): string {
  return Array.isArray(value) ? `[${value.map(literal).join(", ")}]` : JSON.stringify(value);
}

function renderProviderOptions(choice: ProviderChoice): string[] {
  return Object.entries(buildProviderOptions(choice)).flatMap(([key, value]) => {
    const line = `      ${key}: ${literal(value)},`;
    const comment = optionComment(key, choice);
    return comment === undefined ? [line] : [comment, line];
  });
}

function renderHumanOnlyProviderBlock(): string {
  return [
    "  provider: {",
    "    // Machine translation disabled by policy: translate fills only from the translation",
    "    // memory, and every other key is handed to a human through export and import.",
    `    id: ${JSON.stringify(HUMAN_ONLY_PROVIDER)},`,
    "  },",
  ].join("\n");
}

function renderProviderBlock(choice: ProviderChoice): string {
  if (choice.id === HUMAN_ONLY_PROVIDER) {
    return renderHumanOnlyProviderBlock();
  }
  const optionLines = renderProviderOptions(choice);
  const noteText = NO_MODEL_NOTES[choice.id];
  const note = noteText === undefined ? [] : [noteText];
  const body =
    optionLines.length === 0 ? ["    options: {},"] : ["    options: {", ...optionLines, "    },"];
  return ["  provider: {", `    id: ${JSON.stringify(choice.id)},`, ...note, ...body, "  },"].join(
    "\n",
  );
}

function formatComment(origin: FormatOrigin): string {
  return origin === "default"
    ? `  // TODO: set your locale file format (one of: ${scaffoldingMetadata.supportedFormats.join(", ")}).`
    : "  // The format of your locale files.";
}

function renderLocaleStyle(localeStyle: LocaleStyle | undefined): string[] {
  if (localeStyle === undefined || localeStyle === "literal") {
    return [];
  }
  return [
    "    // How each locale is spelled in the file path.",
    `    localeStyle: ${JSON.stringify(localeStyle)},`,
  ];
}

export function renderConfig(draft: ConfigDraft): string {
  return [
    `import { defineConfig } from ${JSON.stringify(draft.importName)};`,
    "",
    "export default defineConfig({",
    "  // The locale your source strings are written in.",
    `  sourceLocale: ${JSON.stringify(draft.sourceLocale)},`,
    "  // The locales to translate into (must not include the source locale).",
    `  targetLocales: ${literal(draft.targetLocales)},`,
    formatComment(draft.formatOrigin),
    `  format: ${JSON.stringify(draft.format)},`,
    "  files: {",
    "    // Path to each locale file; must contain the {locale} token.",
    `    pattern: ${JSON.stringify(draft.pattern)},`,
    ...renderLocaleStyle(draft.localeStyle),
    "  },",
    renderProviderBlock(draft.provider),
    "});",
    "",
  ].join("\n");
}

const ENV_EXAMPLE_HEADER_PREFIX = "# Copy this file to .env";

export function envExampleHeader(choice: ProviderChoice, envVar: string): string {
  return isOptionalKey(choice)
    ? `${ENV_EXAMPLE_HEADER_PREFIX}. Set ${envVar} only if your server requires a key. Do not commit your real key.`
    : `${ENV_EXAMPLE_HEADER_PREFIX} and set your ${choice.id} API key. Do not commit your real key.`;
}

export function isEnvExampleHeader(line: string): boolean {
  return line.startsWith(ENV_EXAMPLE_HEADER_PREFIX);
}

export function renderEnvExample(choice: ProviderChoice, envVar: string): string {
  return [envExampleHeader(choice, envVar), `${envVar}=`, ""].join("\n");
}

export function namesEnvVar(content: string, envVar: string): boolean {
  const assignment = new RegExp(`^(?:export\\s+)?${envVar}\\s*=`);
  return content.split(/\r?\n/).some((line) => assignment.test(line.trim()));
}
