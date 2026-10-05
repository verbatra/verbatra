import type { BuildXliffInput, XliffExportUnit, XliffNote } from "./build-xliff.js";
import { bcp47 } from "./language-tag.js";
import { type NumberedSpan, numberInlineCodes } from "./xliff-inline-codes.js";
import {
  METADATA_CATEGORY,
  ORIGIN_META_TYPE,
  REVIEW_STATE_META_TYPE,
  SOURCE_HASH_META_TYPE,
  XLIFF2_METADATA_NAMESPACE,
  XLIFF2_NAMESPACE,
} from "./xliff-vocabulary.js";
import { splitOnIllegalXmlCharacters } from "./xml-character.js";
import { escapeAttribute, escapeText } from "./xml-escape.js";

function codePoint(character: string): string {
  const code = character.codePointAt(0) ?? 0;
  return code.toString(16).toUpperCase().padStart(4, "0");
}

function renderText(text: string): string {
  return splitOnIllegalXmlCharacters(text)
    .map((part, index) => (index % 2 === 0 ? escapeText(part) : `<cp hex="${codePoint(part)}"/>`))
    .join("");
}

function renderSpans(spans: readonly NumberedSpan[]): string {
  return spans
    .map((span) =>
      span.kind === "text"
        ? renderText(span.text)
        : `<ph id="${span.id}" dataRef="${span.dataId}" disp="${escapeAttribute(span.code)}" equiv="${escapeAttribute(span.code)}"/>`,
    )
    .join("");
}

function renderMeta(type: string, value: string): string {
  return `          <mda:meta type="${type}">${escapeText(value)}</mda:meta>`;
}

function provenanceMetas(unit: XliffExportUnit): string[] {
  const provenance = unit.provenance;
  if (provenance === undefined || unit.target === undefined) {
    return [];
  }
  return [
    renderMeta(ORIGIN_META_TYPE, provenance.origin),
    renderMeta(REVIEW_STATE_META_TYPE, provenance.reviewState),
  ];
}

function renderMetadata(unit: XliffExportUnit): string[] {
  return [
    "      <mda:metadata>",
    `        <mda:metaGroup category="${METADATA_CATEGORY}">`,
    renderMeta(SOURCE_HASH_META_TYPE, unit.sourceHash),
    ...provenanceMetas(unit),
    "        </mda:metaGroup>",
    "      </mda:metadata>",
  ];
}

function renderNotes(notes: readonly XliffNote[]): string[] {
  if (notes.length === 0) {
    return [];
  }
  return [
    "      <notes>",
    ...notes.map(
      (note) =>
        `        <note category="${escapeAttribute(note.category)}">${escapeText(note.text)}</note>`,
    ),
    "      </notes>",
  ];
}

function renderOriginalData(data: ReadonlyMap<string, string>): string[] {
  if (data.size === 0) {
    return [];
  }
  return [
    "      <originalData>",
    ...[...data].map(([id, code]) => `        <data id="${id}">${renderText(code)}</data>`),
    "      </originalData>",
  ];
}

function renderSegment(unit: XliffExportUnit): string[] {
  const numbered = numberInlineCodes(unit.source, unit.target);
  const target =
    numbered.target === undefined
      ? []
      : [`        <target>${renderSpans(numbered.target)}</target>`];
  return [
    ...renderOriginalData(numbered.data),
    `      <segment state="${unit.state}">`,
    `        <source>${renderSpans(numbered.source)}</source>`,
    ...target,
    "      </segment>",
  ];
}

function renderUnit(unit: XliffExportUnit, ordinal: number): string {
  return [
    `    <unit id="u${ordinal}" name="${escapeAttribute(unit.key)}">`,
    ...renderMetadata(unit),
    ...renderNotes(unit.notes),
    ...renderSegment(unit),
    "    </unit>",
  ].join("\n");
}

export function renderXliff2(input: BuildXliffInput): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<xliff xmlns="${XLIFF2_NAMESPACE}" xmlns:mda="${XLIFF2_METADATA_NAMESPACE}" version="2.0" srcLang="${escapeAttribute(bcp47(input.sourceLanguage))}" trgLang="${escapeAttribute(bcp47(input.targetLanguage))}">`,
    '  <file id="f1" original="verbatra" xml:space="preserve">',
    ...input.units.map((unit, index) => renderUnit(unit, index + 1)),
    "  </file>",
    "</xliff>",
    "",
  ].join("\n");
}
