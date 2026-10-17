import { type LocaleResource, protectedRuns, type TranslationEntry } from "@verbatra/core";
import type {
  InlineSpan,
  WorkbookRow,
  XliffExportUnit,
  XliffNote,
  XliffProvenance,
  XliffState,
} from "@verbatra/exchange";
import { isMachineClassOrigin, keyProvenance } from "../../lock/key-provenance.js";
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

export function exportProvenance(
  row: WorkbookRow,
  record: ProvenanceRecord | undefined,
  baselineHash: string | undefined,
): XliffProvenance {
  const provenance = keyProvenance(record, row.currentTarget, baselineHash);
  return {
    origin: provenance.origin,
    reviewState: provenance.reviewState,
    machineSuggestion:
      isMachineClassOrigin(provenance.origin) && provenance.reviewState !== "approved",
  };
}

export interface XliffUnitsInput {
  readonly rows: readonly WorkbookRow[];
  readonly source: LocaleResource;
  readonly records: ReadonlyMap<string, ProvenanceRecord> | undefined;
  readonly baseline: ReadonlyMap<string, string>;
}

function unitOf(row: WorkbookRow, input: XliffUnitsInput): XliffExportUnit {
  const record = input.records?.get(row.key);
  const baselineHash = input.baseline.get(row.key);
  const hasTarget = row.status !== "new";
  return {
    key: row.key,
    source: inlineSpans(row.source),
    ...(hasTarget ? { target: inlineSpans(row.currentTarget) } : {}),
    state: exportState(row, record, baselineHash),
    sourceHash: row.sourceHash,
    notes: notesOf(input.source.entries.get(row.key)),
    ...(hasTarget && input.records !== undefined
      ? { provenance: exportProvenance(row, record, baselineHash) }
      : {}),
  };
}

export function xliffUnits(input: XliffUnitsInput): XliffExportUnit[] {
  return input.rows.map((row) => unitOf(row, input));
}
