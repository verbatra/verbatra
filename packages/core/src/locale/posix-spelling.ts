import type { FormatId } from "../model/format-id.js";
import { type LocaleTag, parseLocaleTag } from "./locale-tag.js";

export type ScriptConvention = "icu" | "gettext";

const GETTEXT_FORMATS: ReadonlySet<FormatId> = new Set<FormatId>(["gettext-po"]);

const SCRIPT_MODIFIERS = [
  ["Latn", "latin"],
  ["Cyrl", "cyrillic"],
  ["Deva", "devanagari"],
] as const;

const MODIFIER_BY_SCRIPT: ReadonlyMap<string, string> = new Map(
  SCRIPT_MODIFIERS.map(([script, modifier]) => [script.toLowerCase(), modifier]),
);

const SCRIPT_BY_MODIFIER: ReadonlyMap<string, string> = new Map(
  SCRIPT_MODIFIERS.map(([script, modifier]) => [modifier, script]),
);

const MODIFIER_SEPARATOR = "@";

export type LocaleSpelling =
  | { readonly spelling: string }
  | { readonly spelling?: undefined; readonly reason?: string };

export function scriptConventionOf(format: FormatId): ScriptConvention {
  return GETTEXT_FORMATS.has(format) ? "gettext" : "icu";
}

function scriptForModifier(modifier: string): string | undefined {
  return SCRIPT_BY_MODIFIER.get(modifier);
}

function modifierForScript(script: string): string | undefined {
  return MODIFIER_BY_SCRIPT.get(script.toLowerCase());
}

const SUPPORTED_MODIFIERS = SCRIPT_MODIFIERS.map(
  ([script, modifier]) => `${MODIFIER_SEPARATOR}${modifier} (${script})`,
).join(", ");

function impliedScript(tag: LocaleTag): string | undefined {
  const base = tag.region === undefined ? tag.language : `${tag.language}-${tag.region}`;
  return new Intl.Locale(base).maximize().script?.toLowerCase();
}

function withoutScript(locale: string, tag: LocaleTag): string {
  const [language = "", , ...rest] = locale.split("-");
  return tag.region === undefined ? language : [language, ...rest].join("_");
}

function gettextSpelling(locale: string, tag: LocaleTag): LocaleSpelling {
  const { script } = tag;
  if (script === undefined) {
    return { spelling: locale.replaceAll("-", "_") };
  }
  const base = withoutScript(locale, tag);
  if (impliedScript(tag) === script) {
    return { spelling: base };
  }
  const modifier = modifierForScript(script);
  if (modifier === undefined) {
    return {
      reason: `gettext writes a script only as one of the modifiers ${SUPPORTED_MODIFIERS}, or leaves it out where the language and region imply it (zh-Hant-TW is written zh_TW)`,
    };
  }
  return { spelling: `${base}${MODIFIER_SEPARATOR}${modifier}` };
}

export function posixSpelling(locale: string, convention: ScriptConvention): LocaleSpelling {
  const tag = parseLocaleTag(locale);
  if (tag === undefined) {
    return { reason: "it is not a plain language, script and region tag" };
  }
  if (tag.variants.length > 0) {
    return { reason: "a variant subtag has no posix spelling" };
  }
  return convention === "gettext"
    ? gettextSpelling(locale, tag)
    : { spelling: locale.replaceAll("-", "_") };
}

export function splitGettextModifier(
  spelling: string,
): { readonly base: string; readonly script: string | undefined } | undefined {
  const at = spelling.indexOf(MODIFIER_SEPARATOR);
  if (at === -1) {
    return { base: spelling, script: undefined };
  }
  const script = scriptForModifier(spelling.slice(at + 1));
  return script === undefined ? undefined : { base: spelling.slice(0, at), script };
}
