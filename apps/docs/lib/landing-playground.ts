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

export const PLAYGROUND_DEFAULT_ITEM = "welcomeBack";

export const PLAYGROUND_FILES_PATTERN = "messages/{locale}.json";

export function playgroundFileName(locale: string): string {
  return PLAYGROUND_FILES_PATTERN.replace("{locale}", locale).split("/").pop() ?? "";
}

export function playgroundGeneratedOn(locale: string): { iso: string; text: string } {
  return {
    iso: PLAYGROUND_METADATA.generatedAt.slice(0, 10),
    text: new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" }).format(
      new Date(PLAYGROUND_METADATA.generatedAt),
    ),
  };
}
