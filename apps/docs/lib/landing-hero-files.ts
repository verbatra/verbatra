import {
  PLAYGROUND_DEFAULT_ITEM,
  PLAYGROUND_FILES_PATTERN,
  PLAYGROUND_TRANSLATIONS,
} from "./landing-playground";
import { LOCK_DEMO_PLAYGROUND_IDS } from "./lock-demo";

export type HeroFileLine = {
  readonly id: string;
  readonly text: string;
  readonly changed: boolean;
};

export const HERO_BACK_LOCALES = ["fr", "es"] as const;

export const HERO_FRONT_LOCALE = "de";

const [FIRST_CHANGED_ID = "", SECOND_CHANGED_ID = ""] = Object.values(LOCK_DEMO_PLAYGROUND_IDS);

const HERO_FILE_IDS: ReadonlyArray<{ readonly id: string; readonly changed: boolean }> = [
  { id: PLAYGROUND_DEFAULT_ITEM, changed: false },
  { id: "settings", changed: false },
  { id: FIRST_CHANGED_ID, changed: true },
  { id: SECOND_CHANGED_ID, changed: true },
  { id: "deleteFile", changed: false },
];

export const HERO_FILE_CHANGED_COUNT = HERO_FILE_IDS.filter(({ changed }) => changed).length;

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
  return HERO_FILE_IDS.map(({ id, changed }, index) => ({
    id,
    changed,
    text: jsonPair(locale, id, index < HERO_FILE_IDS.length - 1),
  }));
}
