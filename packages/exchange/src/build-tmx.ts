import { stripIllegalXmlCharacters } from "./xml-character.js";

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

function escapeAttribute(raw: string): string {
  return escapeText(raw).replaceAll('"', "&quot;");
}

function tuv(language: string, text: string): string {
  return `      <tuv xml:lang="${escapeAttribute(language)}"><seg>${escapeText(text)}</seg></tuv>`;
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
    ["srclang", sourceLanguage],
    ["datatype", "plaintext"],
  ];
  const rendered = attributes
    .map(([name, value]) => `${name}="${escapeAttribute(value)}"`)
    .join(" ");
  return `  <header ${rendered}/>`;
}

/**
 * Serializes translation units as a TMX 1.4b document.
 *
 * Segment text is escaped rather than trusted: the ampersand is replaced first so no escape is
 * written twice, both angle brackets become entities so markup inside a translation stays data, and
 * a carriage return becomes a numeric character reference so a reader's line-ending normalization
 * cannot silently drop it. A character XML 1.0 cannot represent at all is removed, because writing
 * it would produce a file no parser accepts.
 *
 * @param input - The source language, the units, and the tool version to stamp on the header.
 * @returns The whole TMX document as UTF-8 text, ending in a newline.
 *
 * @example
 * ```ts
 * const tmx = buildTmx({
 *   sourceLanguage: "en",
 *   units: [{ source: "Hello", translations: [{ language: "de", text: "Hallo" }] }],
 * });
 * ```
 */
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
