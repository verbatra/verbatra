import { HERO_TERMINAL_CHANGED_KEYS } from "./hero-terminal";
import {
  PLAYGROUND_DEFAULT_ITEM,
  PLAYGROUND_TRANSLATIONS,
  playgroundFileName,
} from "./landing-playground";
import { playgroundIdOf } from "./lock-demo";

export type HeroFileLine = {
  readonly id: string;
  readonly key: string;
  readonly text: string;
  readonly changed: boolean;
};

export const HERO_BACK_LOCALES = ["fr", "es"] as const;

export const HERO_FRONT_LOCALE = "de";

type HeroFileId = {
  readonly id: string;
  readonly key: string;
  readonly changed: boolean;
};

const HERO_FILE_IDS: ReadonlyArray<HeroFileId> = [
  { id: PLAYGROUND_DEFAULT_ITEM, key: PLAYGROUND_DEFAULT_ITEM, changed: false },
  { id: "settings", key: "settings", changed: false },
  ...HERO_TERMINAL_CHANGED_KEYS.map((key) => ({ id: playgroundIdOf(key), key, changed: true })),
  { id: "deleteFile", key: "deleteFile", changed: false },
];

export const HERO_FILE_CHANGED_COUNT = HERO_FILE_IDS.filter(({ changed }) => changed).length;

export function heroFileName(locale: string): string {
  return playgroundFileName(locale);
}

function jsonPair(locale: string, { id, key }: HeroFileId, comma: boolean): string {
  const value = PLAYGROUND_TRANSLATIONS[locale]?.[id] ?? "";
  return `${JSON.stringify(key)}: ${JSON.stringify(value)}${comma ? "," : ""}`;
}

export function heroFilePreview(locale: string): string {
  return jsonPair(
    locale,
    { id: PLAYGROUND_DEFAULT_ITEM, key: PLAYGROUND_DEFAULT_ITEM, changed: false },
    false,
  );
}

export function heroFileLines(locale: string): ReadonlyArray<HeroFileLine> {
  return HERO_FILE_IDS.map((entry, index) => ({
    id: entry.id,
    key: entry.key,
    changed: entry.changed,
    text: jsonPair(locale, entry, index < HERO_FILE_IDS.length - 1),
  }));
}
