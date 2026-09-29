import { type LocaleResource, protectedRuns, type TranslationEntry } from "@verbatra/core";
import type {
  InlineSpan,
  WorkbookRow,
  XliffExportUnit,
  XliffNote,
  XliffState,
} from "@verbatra/exchange";
import { keyProvenance } from "../../lock/key-provenance.js";
import type { ProvenanceRecord } from "../../lock/provenance-file.js";

export function inlineSpans(value: string): InlineSpan[] {
  return protectedRuns(value).map((run) =>
    run.protected ? { kind: "code", code: run.text } : { kind: "text", text: run.text },
  );
}

export function exportState(
  row: WorkbookRow,
  record: ProvenanceRecord | undefined,
  baselineHash: string | undefined,
): XliffState {
  if (row.status !== "unchanged") {
    return "initial";
  }
  const review = keyProvenance(record, row.currentTarget, baselineHash).reviewState;
  if (review === "approved") {
    return "reviewed";
  }
  return review === "rejected" ? "initial" : "translated";
}

function notesOf(entry: TranslationEntry | undefined): XliffNote[] {
  const notes: XliffNote[] = [];
  if (entry?.description !== undefined && entry.description !== "") {
    notes.push({ category: "description", text: entry.description });
  }
  if (entry?.meaning !== undefined && entry.meaning !== "") {
    notes.push({ category: "meaning", text: entry.meaning });
  }
  return notes;
}

export interface XliffUnitsInput {
  readonly rows: readonly WorkbookRow[];
  readonly source: LocaleResource;
  readonly records: ReadonlyMap<string, ProvenanceRecord>;
  readonly baseline: ReadonlyMap<string, string>;
}

export function xliffUnits(input: XliffUnitsInput): XliffExportUnit[] {
  return input.rows.map((row) => ({
    key: row.key,
    source: inlineSpans(row.source),
    ...(row.status === "new" ? {} : { target: inlineSpans(row.currentTarget) }),
    state: exportState(row, input.records.get(row.key), input.baseline.get(row.key)),
    sourceHash: row.sourceHash,
    notes: notesOf(input.source.entries.get(row.key)),
  }));
}
