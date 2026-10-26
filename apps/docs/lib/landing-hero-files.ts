import {
  PLAYGROUND_DEFAULT_ITEM,
  PLAYGROUND_FILES_PATTERN,
  PLAYGROUND_TRANSLATIONS,
} from "./landing-playground";

export type HeroFileLine = {
  readonly id: string;
  readonly text: string;
  readonly added: boolean;
};

export const HERO_BACK_LOCALES = ["fr", "es"] as const;

export const HERO_FRONT_LOCALE = "de";

const HERO_FILE_IDS: ReadonlyArray<{ readonly id: string; readonly added: boolean }> = [
  { id: PLAYGROUND_DEFAULT_ITEM, added: false },
  { id: "settings", added: false },
  { id: "messages", added: true },
  { id: "cartEmpty", added: true },
  { id: "deleteFile", added: false },
];

export const HERO_FILE_ADDED_COUNT = HERO_FILE_IDS.filter(({ added }) => added).length;

export function heroFileName(locale: string): string {
  return PLAYGROUND_FILES_PATTERN.replace("{locale}", locale);
}

function jsonPair(locale: string, id: string, comma: boolean): string {
  const value = PLAYGROUND_TRANSLATIONS[locale]?.[id] ?? "";
  return `${JSON.stringify(id)}: ${JSON.stringify(value)}${comma ? "," : ""}`;
}

export function heroFilePreview(locale: string): string {
  return jsonPair(locale, PLAYGROUND_DEFAULT_ITEM, false);
}

export function heroFileLines(locale: string): ReadonlyArray<HeroFileLine> {
  return HERO_FILE_IDS.map(({ id, added }, index) => ({
    id,
    added,
    text: jsonPair(locale, id, index < HERO_FILE_IDS.length - 1),
  }));
}
