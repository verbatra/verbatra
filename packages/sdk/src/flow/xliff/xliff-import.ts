import { contentHash, type LocaleResource } from "@verbatra/core";
import {
  readXliff,
  type WorkbookDuplicateKey,
  type WorkbookRow,
  type WorkbookRowProblem,
  type WorkbookSheet,
  type XliffDocument,
  type XliffState,
  type XliffUnit,
} from "@verbatra/exchange";
import type { VerbatraConfig } from "../../config/schema.js";
import { sameTag } from "../tmx/locale-match.js";
import type { HandoffFiles, HandoffSource } from "../workbook/handoff-files.js";

export type HandoffStates = ReadonlyMap<string, ReadonlyMap<string, XliffState>>;

export interface XliffHandoff {
  readonly sheets: readonly WorkbookSheet[];
  readonly malformedRows: readonly WorkbookRowProblem[];
  readonly duplicateKeys: readonly WorkbookDuplicateKey[];
  readonly states: HandoffStates;
  readonly expectedLocales: readonly string[];
}

function isBlank(value: string | undefined): boolean {
  return value === undefined || value.trim() === "";
}

function unitSourceHash(unit: XliffUnit, source: LocaleResource): string {
  if (unit.sourceHash !== undefined) {
    return unit.sourceHash;
  }
  const entry = source.entries.get(unit.key);
  return entry !== undefined && entry.value === unit.source ? contentHash(entry) : "";
}

function unitRow(unit: XliffUnit, source: LocaleResource): WorkbookRow {
  return {
    key: unit.key,
    source: unit.source,
    currentTarget: "",
    status: "unchanged",
    sourceHash: unitSourceHash(unit, source),
    translation: isBlank(unit.target) ? "" : (unit.target ?? ""),
    context: "",
    reviewStatus: "ok",
    reviewReasons: "",
  };
}

function lineOf(line: number | undefined): { readonly line?: number } {
  return line === undefined ? {} : { line };
}

interface LocaleHandoff {
  readonly sheet: WorkbookSheet;
  readonly malformed: WorkbookRowProblem[];
  readonly duplicates: WorkbookDuplicateKey[];
  readonly states: Map<string, XliffState>;
}

function localeHandoff(
  locale: string,
  document: XliffDocument,
  source: LocaleResource,
): LocaleHandoff {
  const rows: WorkbookRow[] = [];
  const states = new Map<string, XliffState>();
  const malformed: WorkbookRowProblem[] = document.problems.map((problem) => ({
    locale,
    row: problem.ordinal,
    ...lineOf(problem.line),
    column: problem.field,
  }));
  const duplicates: WorkbookDuplicateKey[] = [];
  for (const unit of document.units) {
    const at = { row: unit.ordinal, ...lineOf(unit.line) };
    if (!source.entries.has(unit.key)) {
      malformed.push({ locale, ...at, column: "id" });
    } else if (states.has(unit.key)) {
      duplicates.push({ locale, key: unit.key, ...at });
    } else {
      states.set(unit.key, unit.state);
      rows.push(unitRow(unit, source));
    }
  }
  malformed.sort((left, right) => left.row - right.row);
  return { sheet: { locale, rows }, malformed, duplicates, states };
}

function resolveLocale(
  handoff: HandoffSource,
  document: XliffDocument,
  config: VerbatraConfig,
  singleFile: boolean,
): string {
  if (!singleFile || config.targetLocales.includes(handoff.locale)) {
    return handoff.locale;
  }
  const declared = document.targetLanguage;
  const match =
    declared === undefined
      ? undefined
      : config.targetLocales.find((locale) => sameTag(locale, declared));
  return match ?? handoff.locale;
}

export function readXliffHandoff(
  files: HandoffFiles,
  source: LocaleResource,
  config: VerbatraConfig,
): XliffHandoff {
  const sheets: WorkbookSheet[] = [];
  const malformedRows: WorkbookRowProblem[] = [];
  const duplicateKeys: WorkbookDuplicateKey[] = [];
  const states = new Map<string, ReadonlyMap<string, XliffState>>();
  for (const handoff of files.sources) {
    const document = readXliff(handoff.text);
    const locale = resolveLocale(handoff, document, config, files.singleFile);
    const read = localeHandoff(locale, document, source);
    sheets.push(read.sheet);
    malformedRows.push(...read.malformed);
    duplicateKeys.push(...read.duplicates);
    states.set(locale, read.states);
  }
  return {
    sheets,
    malformedRows,
    duplicateKeys,
    states,
    expectedLocales: files.singleFile ? sheets.map((sheet) => sheet.locale) : files.expectedLocales,
  };
}
