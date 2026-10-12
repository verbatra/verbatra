export type CompareMark = "yes" | "partial" | "no";

export type CompareColumn = "verbatra" | "manual" | "tms";

export type CompareRowId =
  | "changedOnly"
  | "ciGate"
  | "placeholders"
  | "files"
  | "data"
  | "collaboration"
  | "workflow"
  | "cost"
  | "setup";

export type CompareRow = {
  readonly id: CompareRowId;
  readonly marks?: Readonly<Record<CompareColumn, CompareMark>>;
};

export const COMPARE_COLUMNS: ReadonlyArray<CompareColumn> = ["verbatra", "manual", "tms"];

export const COMPARE_ROWS: ReadonlyArray<CompareRow> = [
  { id: "changedOnly", marks: { verbatra: "yes", manual: "partial", tms: "yes" } },
  { id: "ciGate", marks: { verbatra: "yes", manual: "partial", tms: "partial" } },
  { id: "placeholders", marks: { verbatra: "yes", manual: "partial", tms: "partial" } },
  { id: "files" },
  { id: "data" },
  { id: "collaboration", marks: { verbatra: "partial", manual: "partial", tms: "yes" } },
  { id: "workflow", marks: { verbatra: "no", manual: "no", tms: "yes" } },
  { id: "cost" },
  { id: "setup" },
];
