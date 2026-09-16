import { countIllegalXmlCharacters, stripIllegalXmlCharacters } from "./xml-character.js";

export interface TmxTranslation {
  readonly language: string;
  readonly text: string;
}

export interface TmxExportUnit {
  readonly source: string;
  readonly translations: readonly TmxTranslation[];
}

export interface BuildTmxInput {
  readonly sourceLanguage: string;
  readonly units: readonly TmxExportUnit[];
  readonly toolVersion?: string;
}

const CREATION_TOOL = "verbatra";

const UNKNOWN_TOOL_VERSION = "unknown";

function escapeText(raw: string): string {
  return stripIllegalXmlCharacters(raw)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\r", "&#13;");
}

const REGION_SUBTAG = /^[a-z]{2}$/i;

const SCRIPT_SUBTAG = /^[a-z]{4}$/i;

function casedSubtag(subtag: string): string {
  const lower = subtag.toLowerCase();
  if (REGION_SUBTAG.test(subtag)) {
    return subtag.toUpperCase();
  }
  return SCRIPT_SUBTAG.test(subtag) ? `${lower.charAt(0).toUpperCase()}${lower.slice(1)}` : lower;
}

function bcp47(tag: string): string {
  const [language = "", ...rest] = tag.replaceAll("_", "-").split("-");
  const singleton = rest.findIndex((subtag) => subtag.length === 1);
  const cased = singleton === -1 ? rest.length : singleton;
  return [
    language.toLowerCase(),
    ...rest.slice(0, cased).map(casedSubtag),
    ...rest.slice(cased).map((subtag) => subtag.toLowerCase()),
  ].join("-");
}

function escapeAttribute(raw: string): string {
  return escapeText(raw).replaceAll('"', "&quot;");
}

function tuv(language: string, text: string): string {
  return `      <tuv xml:lang="${escapeAttribute(bcp47(language))}"><seg>${escapeText(text)}</seg></tuv>`;
}

function tu(unit: TmxExportUnit, sourceLanguage: string): string {
  const rows = [
    tuv(sourceLanguage, unit.source),
    ...unit.translations.map((translation) => tuv(translation.language, translation.text)),
  ];
  return `    <tu>\n${rows.join("\n")}\n    </tu>`;
}

function header(sourceLanguage: string, toolVersion: string): string {
  const attributes: ReadonlyArray<readonly [string, string]> = [
    ["creationtool", CREATION_TOOL],
    ["creationtoolversion", toolVersion],
    ["segtype", "block"],
    ["o-tmf", CREATION_TOOL],
    ["adminlang", "en"],
    ["srclang", bcp47(sourceLanguage)],
    ["datatype", "plaintext"],
  ];
  const rendered = attributes
    .map(([name, value]) => `${name}="${escapeAttribute(value)}"`)
    .join(" ");
  return `  <header ${rendered}/>`;
}

export function buildTmx(input: BuildTmxInput): string {
  const units = input.units.map((unit) => tu(unit, input.sourceLanguage));
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<tmx version="1.4">',
    header(input.sourceLanguage, input.toolVersion ?? UNKNOWN_TOOL_VERSION),
    "  <body>",
    ...units,
    "  </body>",
    "</tmx>",
    "",
  ].join("\n");
}

export function removedCharacterCount(input: BuildTmxInput): number {
  let removed = 0;
  for (const unit of input.units) {
    removed += countIllegalXmlCharacters(unit.source);
    for (const translation of unit.translations) {
      removed += countIllegalXmlCharacters(translation.text);
    }
  }
  return removed;
}
