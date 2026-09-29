import { renderXliff2 } from "./build-xliff2.js";
import { renderXliff12 } from "./build-xliff12.js";
import type { InlineSpan, XliffState, XliffVersion } from "./xliff-vocabulary.js";

export interface XliffNote {
  readonly category: string;
  readonly text: string;
}

export interface XliffExportUnit {
  readonly key: string;
  readonly source: readonly InlineSpan[];
  readonly target?: readonly InlineSpan[];
  readonly state: XliffState;
  readonly sourceHash: string;
  readonly notes: readonly XliffNote[];
}

export interface BuildXliffInput {
  readonly version: XliffVersion;
  readonly sourceLanguage: string;
  readonly targetLanguage: string;
  readonly units: readonly XliffExportUnit[];
}

export function buildXliff(input: BuildXliffInput): string {
  return input.version === "2.0" ? renderXliff2(input) : renderXliff12(input);
}
