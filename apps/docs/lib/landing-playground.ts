import { type PlaygroundOutput, playgroundOutputSchema } from "./playground/schema";
import committed from "./playground/translations.json" with { type: "json" };
import { type PlaygroundSnippetConfig, playgroundSnippet } from "./playground-snippet";

export type PlaygroundItem = { readonly id: string; readonly text: string };

export type PlaygroundTranslations = Readonly<Record<string, Readonly<Record<string, string>>>>;

export type PlaygroundMetadata = PlaygroundOutput["metadata"];

const OUTPUT = playgroundOutputSchema.parse(committed);

export const PLAYGROUND_ITEMS: ReadonlyArray<PlaygroundItem> = OUTPUT.items.map(({ id, text }) => ({
  id,
  text,
}));

export const PLAYGROUND_TRANSLATIONS: PlaygroundTranslations = OUTPUT.translations;

export const PLAYGROUND_LANGUAGES: ReadonlyArray<string> = Object.keys(OUTPUT.translations);

export const PLAYGROUND_METADATA: PlaygroundMetadata = OUTPUT.metadata;

export const PLAYGROUND_SOURCE_LOCALE = "en";

export const PLAYGROUND_DEFAULT_ITEM = "welcome";

export const PLAYGROUND_MAX_OUTPUT_TOKENS = 2048;

export const PLAYGROUND_FORMAT = "next-intl-json";

export const PLAYGROUND_FILES_PATTERN = "messages/{locale}.json";

export const PLAYGROUND_SNIPPET_FILE = "translate.ts";

export const PLAYGROUND_SNIPPET_CONFIG: PlaygroundSnippetConfig = {
  sourceLocale: PLAYGROUND_SOURCE_LOCALE,
  format: PLAYGROUND_FORMAT,
  filesPattern: PLAYGROUND_FILES_PATTERN,
  provider: PLAYGROUND_METADATA.provider,
  model: PLAYGROUND_METADATA.model,
  maxOutputTokens: PLAYGROUND_MAX_OUTPUT_TOKENS,
};

export const PLAYGROUND_SNIPPET = playgroundSnippet(
  PLAYGROUND_SNIPPET_CONFIG,
  PLAYGROUND_LANGUAGES,
);

export const PLAYGROUND_DOCS_LINKS = [
  ["quickstart", "/docs/sdk-quickstart"],
  ["reference", "/docs/sdk"],
  ["providers", "/docs/providers"],
] as const;
