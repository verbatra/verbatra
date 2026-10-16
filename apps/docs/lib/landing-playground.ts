import { type PlaygroundOutput, playgroundOutputSchema } from "./playground/schema";
import committed from "./playground/translations.json" with { type: "json" };

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

export const PLAYGROUND_SNIPPET_FILE = "translate.ts";

function quoted(values: ReadonlyArray<string>): string {
  return values.map((value) => `"${value}"`).join(", ");
}

export const PLAYGROUND_SNIPPET = [
  `import { defineConfig, loadConfig, translate } from "@verbatra/sdk";`,
  "",
  "const config = await loadConfig({",
  "  configOverride: defineConfig({",
  `    sourceLocale: "${PLAYGROUND_SOURCE_LOCALE}",`,
  `    targetLocales: [${quoted(PLAYGROUND_LANGUAGES)}],`,
  `    format: "next-intl-json",`,
  `    files: { pattern: "messages/{locale}.json" },`,
  "    provider: {",
  `      id: "${PLAYGROUND_METADATA.provider}",`,
  `      options: { model: "${PLAYGROUND_METADATA.model}", maxOutputTokens: ${PLAYGROUND_MAX_OUTPUT_TOKENS} },`,
  "    },",
  "  }),",
  "});",
  "",
  "const summary = await translate({ config });",
].join("\n");
