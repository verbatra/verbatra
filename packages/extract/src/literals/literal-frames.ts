import { identValue, isPunct } from "../scan/token-query.js";
import type { PositionedToken } from "../scan/tokenize.js";

export type LiteralFrame =
  | {
      readonly kind: "call";
      readonly callee: string;
      readonly receiver: string;
      readonly member: boolean;
      readonly constructed: boolean;
    }
  | { readonly kind: "group"; readonly bracket: "(" | "[" }
  | { readonly kind: "attribute"; readonly name: string }
  | { readonly kind: "child" }
  | { readonly kind: "object"; readonly key: string }
  | { readonly kind: "type" }
  | { readonly kind: "element"; readonly name: string };

const LOOKBEHIND_LIMIT = 200;

const DECLARATION_KEYWORDS = new Set(["let", "const", "var"]);

const TERNARY_STOPPERS = new Set([";", ","]);

const OPENERS = new Set(["(", "[", "{"]);

const CLOSERS = new Set([")", "]", "}"]);

function isTernaryQuestion(tokens: readonly PositionedToken[], index: number): boolean {
  return (
    isPunct(tokens[index], "?") &&
    !isPunct(tokens[index + 1], ".") &&
    !isPunct(tokens[index + 1], "?") &&
    !isPunct(tokens[index - 1], "?")
  );
}

function depthStep(token: PositionedToken | undefined): number {
  if (token?.kind !== "punct") {
    return 0;
  }
  if (CLOSERS.has(token.value)) {
    return 1;
  }
  return OPENERS.has(token.value) ? -1 : 0;
}

export function isTernaryAlternate(
  tokens: readonly PositionedToken[],
  colonIndex: number,
): boolean {
  let depth = 0;
  const floor = Math.max(0, colonIndex - LOOKBEHIND_LIMIT);
  for (let index = colonIndex - 1; index >= floor; index -= 1) {
    const token = tokens[index];
    depth += depthStep(token);
    if (depth < 0) {
      return false;
    }
    if (depth === 0 && token?.kind === "punct" && TERNARY_STOPPERS.has(token.value)) {
      return false;
    }
    if (depth === 0 && isTernaryQuestion(tokens, index)) {
      return true;
    }
  }
  return false;
}

export function isTypeAnnotationColon(
  tokens: readonly PositionedToken[],
  colonIndex: number,
  frames: readonly LiteralFrame[],
): boolean {
  const before = tokens[colonIndex - 1];
  if (isPunct(before, "?")) {
    return true;
  }
  const closesParameters = isPunct(before, ")");
  if ((before?.kind !== "ident" && !closesParameters) || isTernaryAlternate(tokens, colonIndex)) {
    return false;
  }
  const top = frames[frames.length - 1];
  if (closesParameters || top?.kind === "call" || top?.kind === "group") {
    return true;
  }
  return DECLARATION_KEYWORDS.has(identValue(tokens[colonIndex - 2]) ?? "");
}

function isAngleClose(tokens: readonly PositionedToken[], index: number): boolean {
  return isPunct(tokens[index], ">") && !isPunct(tokens[index - 1], "=");
}

function skipTypeArgumentsBackward(tokens: readonly PositionedToken[], index: number): number {
  if (!isAngleClose(tokens, index)) {
    return index;
  }
  let depth = 0;
  const floor = Math.max(0, index - LOOKBEHIND_LIMIT);
  for (let cursor = index; cursor >= floor; cursor -= 1) {
    if (isAngleClose(tokens, cursor)) {
      depth += 1;
    } else if (isPunct(tokens[cursor], "<")) {
      depth -= 1;
      if (depth === 0) {
        return cursor - 1;
      }
    }
  }
  return -1;
}

function callFrame(tokens: readonly PositionedToken[], openIndex: number): LiteralFrame {
  let index = skipTypeArgumentsBackward(tokens, openIndex - 1);
  if (isPunct(tokens[index], ".") && isPunct(tokens[index - 1], "?")) {
    index -= 2;
  }
  const callee = identValue(tokens[index]);
  if (callee === undefined) {
    return { kind: "group", bracket: "(" };
  }
  const member = isPunct(tokens[index - 1], ".");
  const receiver = member ? (identValue(tokens[index - 2]) ?? "") : "";
  const constructed = identValue(tokens[index - (member ? 3 : 1)]) === "new";
  return { kind: "call", callee, receiver, member, constructed };
}

function declaresTypeAlias(tokens: readonly PositionedToken[], equalsIndex: number): boolean {
  const nameIndex = skipTypeArgumentsBackward(tokens, equalsIndex - 1);
  return (
    identValue(tokens[nameIndex]) !== undefined && identValue(tokens[nameIndex - 1]) === "type"
  );
}

const INTERFACE_HEADER_PUNCT = new Set([",", ".", "<", ">"]);

function isInterfaceHeaderToken(token: PositionedToken | undefined): boolean {
  return (
    token?.kind === "ident" || (token?.kind === "punct" && INTERFACE_HEADER_PUNCT.has(token.value))
  );
}

function declaresInterface(tokens: readonly PositionedToken[], braceIndex: number): boolean {
  const floor = Math.max(0, braceIndex - LOOKBEHIND_LIMIT);
  for (let index = braceIndex - 1; index >= floor; index -= 1) {
    const token = tokens[index];
    if (identValue(token) === "interface") {
      return true;
    }
    if (!isInterfaceHeaderToken(token)) {
      return false;
    }
  }
  return false;
}

function opensTypeBody(
  tokens: readonly PositionedToken[],
  braceIndex: number,
  frames: readonly LiteralFrame[],
): boolean {
  const previous = tokens[braceIndex - 1];
  if (isPunct(previous, "=")) {
    return declaresTypeAlias(tokens, braceIndex - 1);
  }
  if (isPunct(previous, ":")) {
    return isTypeAnnotationColon(tokens, braceIndex - 1, frames);
  }
  return declaresInterface(tokens, braceIndex);
}

function braceFrame(
  tokens: readonly PositionedToken[],
  braceIndex: number,
  frames: readonly LiteralFrame[],
): LiteralFrame {
  const previous = tokens[braceIndex - 1];
  if (previous?.kind === "markup-attribute") {
    return { kind: "attribute", name: previous.name };
  }
  if (frames[frames.length - 1]?.kind === "element") {
    return { kind: "child" };
  }
  if (frames.some((frame) => frame.kind === "type") || opensTypeBody(tokens, braceIndex, frames)) {
    return { kind: "type" };
  }
  const key = isPunct(previous, ":") ? (identValue(tokens[braceIndex - 2]) ?? "") : "";
  return { kind: "object", key };
}

function closes(frame: LiteralFrame, closer: string): boolean {
  switch (frame.kind) {
    case "call":
      return closer === ")";
    case "group":
      return closer === (frame.bracket === "(" ? ")" : "]");
    case "element":
      return false;
    default:
      return closer === "}";
  }
}

function popUntil(frames: LiteralFrame[], matches: (frame: LiteralFrame) => boolean): void {
  for (let index = frames.length - 1; index >= 0; index -= 1) {
    const frame = frames[index];
    if (frame !== undefined && matches(frame)) {
      frames.length = index;
      return;
    }
  }
}

function openPunct(
  tokens: readonly PositionedToken[],
  index: number,
  frames: LiteralFrame[],
  value: string,
): void {
  if (value === "(") {
    frames.push(callFrame(tokens, index));
  } else if (value === "[") {
    frames.push({ kind: "group", bracket: "[" });
  } else {
    frames.push(braceFrame(tokens, index, frames));
  }
}

export function updateFrames(
  tokens: readonly PositionedToken[],
  index: number,
  frames: LiteralFrame[],
): void {
  const token = tokens[index];
  if (token?.kind === "markup-open") {
    frames.push({ kind: "element", name: token.name });
  } else if (token?.kind === "markup-close") {
    popUntil(frames, (frame) => frame.kind === "element");
  } else if (token?.kind === "punct" && OPENERS.has(token.value)) {
    openPunct(tokens, index, frames, token.value);
  } else if (token?.kind === "punct" && CLOSERS.has(token.value)) {
    popUntil(frames, (frame) => closes(frame, token.value));
  }
}
