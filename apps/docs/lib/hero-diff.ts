import generated from "./hero-diff.generated.json";
import { HERO_DIFF_SOURCE_LOCALE, HERO_DIFF_TARGET_LOCALE } from "./hero-diff-seed.mjs";

export type HeroDiffFill = {
  readonly key: string;
  readonly lead: string;
  readonly value: string;
};

export type HeroDiffLine = {
  readonly text: string;
  readonly fill?: HeroDiffFill;
};

export type HeroDiffPane = {
  readonly file: string;
  readonly lang: string;
  readonly lines: ReadonlyArray<HeroDiffLine>;
};

type GeneratedPane = { readonly file: string; readonly text: string };

type GeneratedTarget = GeneratedPane & {
  readonly filled: ReadonlyArray<{ readonly key: string; readonly line: number }>;
};

const VALUE_SEPARATOR = '": ';

function textLines(text: string): ReadonlyArray<string> {
  return text.replace(/\n$/, "").split("\n");
}

export function splitFilledLine(key: string, text: string): HeroDiffFill {
  const at = text.indexOf(VALUE_SEPARATOR);
  if (at === -1) throw new Error(`The hero diff line for ${key} holds no value`);
  const cut = at + VALUE_SEPARATOR.length;
  return { key, lead: text.slice(0, cut), value: text.slice(cut) };
}

function sourcePane(pane: GeneratedPane): HeroDiffPane {
  return {
    file: pane.file,
    lang: HERO_DIFF_SOURCE_LOCALE,
    lines: textLines(pane.text).map((text) => ({ text })),
  };
}

function targetPane(pane: GeneratedTarget): HeroDiffPane {
  const filled = new Map(pane.filled.map(({ key, line }) => [line, key]));
  return {
    file: pane.file,
    lang: HERO_DIFF_TARGET_LOCALE,
    lines: textLines(pane.text).map((text, index) => {
      const key = filled.get(index);
      return key === undefined ? { text } : { text, fill: splitFilledLine(key, text) };
    }),
  };
}

export const HERO_DIFF_SOURCE_PANE: HeroDiffPane = sourcePane(generated.source);

export const HERO_DIFF_TARGET_PANE: HeroDiffPane = targetPane(generated.target);
