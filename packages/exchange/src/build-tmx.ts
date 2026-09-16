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
