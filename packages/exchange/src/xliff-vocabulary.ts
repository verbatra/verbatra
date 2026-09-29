import { handoffFileName } from "./handoff-file-name.js";

export type XliffVersion = "1.2" | "2.0";

export type XliffState = "initial" | "translated" | "reviewed" | "final";

export type InlineSpan =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "code"; readonly code: string };

export const XLIFF_FILE_EXTENSION = "xlf";

export const XLIFF2_NAMESPACE = "urn:oasis:names:tc:xliff:document:2.0";

export const XLIFF2_METADATA_NAMESPACE = "urn:oasis:names:tc:xliff:metadata:2.0";

export const XLIFF12_NAMESPACE = "urn:oasis:names:tc:xliff:document:1.2";

export const METADATA_CATEGORY = "verbatra";

export const SOURCE_HASH_META_TYPE = "source-hash";

export const EXTRADATA_SOURCE_HASH_PREFIX = "verbatra-source-hash:";

const STATE_RANK: Readonly<Record<XliffState, number>> = {
  initial: 0,
  translated: 1,
  reviewed: 2,
  final: 3,
};

export function lowestState(states: readonly XliffState[]): XliffState {
  return states.reduce<XliffState>(
    (lowest, state) => (STATE_RANK[state] < STATE_RANK[lowest] ? state : lowest),
    "final",
  );
}

export function xliff12State(state: XliffState, hasTarget: boolean): string {
  switch (state) {
    case "initial":
      return hasTarget ? "needs-translation" : "new";
    case "translated":
      return "translated";
    case "reviewed":
      return "signed-off";
    case "final":
      return "final";
  }
}

const XLIFF12_STATES: ReadonlyMap<string, XliffState> = new Map<string, XliffState>([
  ["translated", "translated"],
  ["signed-off", "reviewed"],
  ["final", "final"],
]);

export function stateFromXliff12(value: string | null): XliffState {
  return value === null ? "initial" : (XLIFF12_STATES.get(value) ?? "initial");
}

const XLIFF2_STATES: ReadonlyMap<string, XliffState> = new Map<string, XliffState>([
  ["translated", "translated"],
  ["reviewed", "reviewed"],
  ["final", "final"],
]);

export function stateFromXliff2(value: string | null): XliffState {
  return value === null ? "initial" : (XLIFF2_STATES.get(value) ?? "initial");
}

export function xliffFileName(locale: string): string {
  return handoffFileName(locale, XLIFF_FILE_EXTENSION, "WORKBOOK_INVALID");
}
