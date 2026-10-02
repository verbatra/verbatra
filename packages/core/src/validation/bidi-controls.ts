const LRE = 0x202a;
const RLE = 0x202b;
const PDF = 0x202c;
const LRO = 0x202d;
const RLO = 0x202e;
const LRI = 0x2066;
const RLI = 0x2067;
const FSI = 0x2068;
const PDI = 0x2069;

const EMBEDDING_OPENERS: ReadonlySet<number> = new Set([LRE, RLE, LRO, RLO]);
const ISOLATE_OPENERS: ReadonlySet<number> = new Set([LRI, RLI, FSI]);
const PARAGRAPH_SEPARATORS: ReadonlySet<number> = new Set([
  0x000a, 0x000d, 0x001c, 0x001d, 0x001e, 0x0085, 0x2029,
]);

type Frame = "embedding" | "isolate";

export interface BidiControlsAssessment {
  readonly balanced: boolean;
  readonly leftOverrides: number;
  readonly rightOverrides: number;
}

interface ScanState {
  readonly stack: Frame[];
  balanced: boolean;
  leftOverrides: number;
  rightOverrides: number;
}

function closeEmbedding(state: ScanState): void {
  if (state.stack.at(-1) === "embedding") {
    state.stack.pop();
    return;
  }
  state.balanced = false;
}

function closeIsolate(state: ScanState): void {
  const innermost = state.stack.lastIndexOf("isolate");
  if (innermost === -1) {
    state.balanced = false;
    return;
  }
  state.stack.length = innermost;
}

function endParagraph(state: ScanState): void {
  if (state.stack.length > 0) {
    state.balanced = false;
    state.stack.length = 0;
  }
}

function countOverride(state: ScanState, code: number): void {
  if (code === LRO) {
    state.leftOverrides += 1;
  } else if (code === RLO) {
    state.rightOverrides += 1;
  }
}

function scanCode(state: ScanState, code: number): void {
  if (EMBEDDING_OPENERS.has(code)) {
    countOverride(state, code);
    state.stack.push("embedding");
  } else if (ISOLATE_OPENERS.has(code)) {
    state.stack.push("isolate");
  } else if (code === PDF) {
    closeEmbedding(state);
  } else if (code === PDI) {
    closeIsolate(state);
  } else if (PARAGRAPH_SEPARATORS.has(code)) {
    endParagraph(state);
  }
}

export function assessBidiControls(value: string): BidiControlsAssessment {
  const state: ScanState = { stack: [], balanced: true, leftOverrides: 0, rightOverrides: 0 };
  for (let index = 0; index < value.length; index++) {
    scanCode(state, value.charCodeAt(index));
  }
  endParagraph(state);
  return {
    balanced: state.balanced,
    leftOverrides: state.leftOverrides,
    rightOverrides: state.rightOverrides,
  };
}
