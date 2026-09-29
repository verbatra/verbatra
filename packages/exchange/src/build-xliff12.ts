import type { BuildXliffInput, XliffExportUnit, XliffNote } from "./build-xliff.js";
import { bcp47 } from "./language-tag.js";
import { type NumberedSpan, numberInlineCodes } from "./xliff-inline-codes.js";
import {
  EXTRADATA_SOURCE_HASH_PREFIX,
  XLIFF12_MT_SUGGESTION,
  XLIFF12_NAMESPACE,
  xliff12State,
} from "./xliff-vocabulary.js";
import { escapeAttribute, escapeText } from "./xml-escape.js";

function renderSpans(spans: readonly NumberedSpan[]): string {
  return spans
    .map((span) =>
      span.kind === "text"
        ? escapeText(span.text)
        : `<ph id="${span.id}" equiv-text="${escapeAttribute(span.code)}">${escapeText(span.code)}</ph>`,
    )
    .join("");
}

function renderNote(note: XliffNote): string {
  return `        <note from="${escapeAttribute(note.category)}">${escapeText(note.text)}</note>`;
}

function isApproved(unit: XliffExportUnit): boolean {
  return unit.state === "reviewed" || unit.state === "final";
}

function targetAttributes(unit: XliffExportUnit): string {
  const state = `state="${xliff12State(unit.state, true)}"`;
  return unit.provenance?.machineSuggestion === true
    ? `${state} state-qualifier="${XLIFF12_MT_SUGGESTION}"`
    : state;
}

function renderTransUnit(unit: XliffExportUnit): string {
  const numbered = numberInlineCodes(unit.source, unit.target);
  const attributes = [
    `id="${escapeAttribute(unit.key)}"`,
    `resname="${escapeAttribute(unit.key)}"`,
    ...(isApproved(unit) ? ['approved="yes"'] : []),
    'xml:space="preserve"',
    `extradata="${escapeAttribute(`${EXTRADATA_SOURCE_HASH_PREFIX}${unit.sourceHash}`)}"`,
  ];
  const target =
    numbered.target === undefined
      ? []
      : [`        <target ${targetAttributes(unit)}>${renderSpans(numbered.target)}</target>`];
  return [
    `      <trans-unit ${attributes.join(" ")}>`,
    `        <source>${renderSpans(numbered.source)}</source>`,
    ...target,
    ...unit.notes.map(renderNote),
    "      </trans-unit>",
  ].join("\n");
}

export function renderXliff12(input: BuildXliffInput): string {
  const file = [
    'original="verbatra"',
    'datatype="plaintext"',
    `source-language="${escapeAttribute(bcp47(input.sourceLanguage))}"`,
    `target-language="${escapeAttribute(bcp47(input.targetLanguage))}"`,
  ];
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<xliff xmlns="${XLIFF12_NAMESPACE}" version="1.2">`,
    `  <file ${file.join(" ")}>`,
    "    <body>",
    ...input.units.map(renderTransUnit),
    "    </body>",
    "  </file>",
    "</xliff>",
    "",
  ].join("\n");
}
