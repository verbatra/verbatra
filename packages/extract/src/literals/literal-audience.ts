import type { PositionedToken } from "../scan/tokenize.js";
import {
  identValue,
  isPunct,
  isTernaryAlternate,
  isTypeAnnotationColon,
  type LiteralFrame,
} from "./literal-frames.js";
import { hasLetters, isDirective, isProseLike, isUrlLike } from "./literal-text.js";

export interface TranslationRecognition {
  readonly calleeNames: ReadonlySet<string>;
  readonly translationElements: ReadonlySet<string>;
  readonly translationHooks: ReadonlySet<string>;
}

const USER_FACING_ATTRIBUTES = new Set([
  "alt",
  "title",
  "placeholder",
  "label",
  "aria-label",
  "aria-description",
  "aria-placeholder",
  "aria-roledescription",
  "aria-valuetext",
]);

const NON_USER_FACING_NAMES = new Set([
  "accept",
  "action",
  "allow",
  "aria-activedescendant",
  "aria-controls",
  "aria-describedby",
  "aria-flowto",
  "aria-labelledby",
  "aria-owns",
  "as",
  "autoComplete",
  "class",
  "className",
  "classNames",
  "color",
  "crossOrigin",
  "css",
  "d",
  "dir",
  "encType",
  "enterKeyHint",
  "fill",
  "form",
  "href",
  "htmlFor",
  "icon",
  "id",
  "inputMode",
  "key",
  "lang",
  "method",
  "name",
  "pattern",
  "points",
  "ref",
  "referrerPolicy",
  "rel",
  "role",
  "sandbox",
  "size",
  "slot",
  "src",
  "srcSet",
  "stroke",
  "style",
  "styles",
  "sx",
  "target",
  "testID",
  "testId",
  "to",
  "transform",
  "tw",
  "type",
  "value",
  "variant",
  "viewBox",
  "xmlns",
]);

const NON_USER_FACING_CALLEES = new Set([
  "classNames",
  "classnames",
  "closest",
  "clsx",
  "createElement",
  "css",
  "cn",
  "cva",
  "cx",
  "debug",
  "findAllByTestId",
  "findByTestId",
  "getAllByTestId",
  "getAttribute",
  "getByTestId",
  "getElementById",
  "getElementsByClassName",
  "getItem",
  "import",
  "keyframes",
  "matches",
  "matchMedia",
  "queryAllByTestId",
  "queryByTestId",
  "querySelector",
  "querySelectorAll",
  "removeEventListener",
  "removeItem",
  "require",
  "setAttribute",
  "setItem",
  "styled",
  "tv",
  "twJoin",
  "twMerge",
]);

const DIRECT_ARGUMENT_CALLEES = new Set([
  "describe",
  "execute",
  "format",
  "parse",
  "prepare",
  "query",
]);

const ARRAY_ARGUMENT_CALLEES = new Set(["enum"]);

const FIRST_ARGUMENT_CALLEES = new Set(["addEventListener", "emit", "off", "on", "once"]);

const FIRST_ARGUMENT_MEMBERS = new Set(["get", "set"]);

const LOG_RECEIVERS = new Set(["console", "logger", "log"]);

const IGNORED_ELEMENTS = new Set(["script", "style", "code"]);

const VALUE_KEYWORDS = new Set(["return", "yield", "await", "default", "else", "do"]);

const TYPE_OPERATORS = ["|", "&"] as const;

function isNonUserFacingName(name: string): boolean {
  return NON_USER_FACING_NAMES.has(name) || name.startsWith("data-");
}

function isExcludedCall(frame: LiteralFrame & { kind: "call" }, rules: TranslationRecognition) {
  return (
    rules.calleeNames.has(frame.callee) ||
    NON_USER_FACING_CALLEES.has(frame.callee) ||
    LOG_RECEIVERS.has(frame.receiver) ||
    (frame.constructed && frame.callee.endsWith("Error"))
  );
}

function isExcludedFrame(frame: LiteralFrame, rules: TranslationRecognition): boolean {
  switch (frame.kind) {
    case "call":
      return isExcludedCall(frame, rules);
    case "element":
      return rules.translationElements.has(frame.name) || IGNORED_ELEMENTS.has(frame.name);
    case "attribute":
      return isNonUserFacingName(frame.name);
    case "object":
      return isNonUserFacingName(frame.key);
    case "type":
      return true;
    default:
      return false;
  }
}

function isFirstArgumentCallee(frame: LiteralFrame & { kind: "call" }): boolean {
  return (
    FIRST_ARGUMENT_CALLEES.has(frame.callee) ||
    (frame.member && FIRST_ARGUMENT_MEMBERS.has(frame.callee))
  );
}

function isNonUserFacingCallArgument(
  tokens: readonly PositionedToken[],
  index: number,
  frame: LiteralFrame & { kind: "call" },
): boolean {
  const previous = tokens[index - 1];
  if (isPunct(previous, "(") && isFirstArgumentCallee(frame)) {
    return true;
  }
  return (
    (isPunct(previous, "(") || isPunct(previous, ",")) && DIRECT_ARGUMENT_CALLEES.has(frame.callee)
  );
}

function isNonUserFacingArrayElement(
  tokens: readonly PositionedToken[],
  index: number,
  frames: readonly LiteralFrame[],
): boolean {
  const parent = frames[frames.length - 2];
  const previous = tokens[index - 1];
  return (
    parent?.kind === "call" &&
    ARRAY_ARGUMENT_CALLEES.has(parent.callee) &&
    (isPunct(previous, "[") || isPunct(previous, ","))
  );
}

function isNonUserFacingArgument(
  tokens: readonly PositionedToken[],
  index: number,
  frames: readonly LiteralFrame[],
): boolean {
  const top = frames[frames.length - 1];
  if (top?.kind === "call") {
    return isNonUserFacingCallArgument(tokens, index, top);
  }
  return (
    top?.kind === "group" &&
    top.bracket === "[" &&
    isNonUserFacingArrayElement(tokens, index, frames)
  );
}

function isSingleOperator(tokens: readonly PositionedToken[], index: number, step: 1 | -1) {
  const token = tokens[index];
  return (
    TYPE_OPERATORS.some((operator) => isPunct(token, operator)) &&
    token?.kind === "punct" &&
    !isPunct(tokens[index + step], token.value)
  );
}

function isTypePosition(
  tokens: readonly PositionedToken[],
  index: number,
  frames: readonly LiteralFrame[],
): boolean {
  if (isSingleOperator(tokens, index - 1, -1) || isSingleOperator(tokens, index + 1, 1)) {
    return true;
  }
  if (isPunct(tokens[index - 1], "<")) {
    return true;
  }
  return isPunct(tokens[index - 1], ":") && isTypeAnnotationColon(tokens, index - 1, frames);
}

function isKeyPosition(tokens: readonly PositionedToken[], index: number): boolean {
  const previous = tokens[index - 1];
  if (isPunct(tokens[index + 1], ":") && (isPunct(previous, "{") || isPunct(previous, ","))) {
    return true;
  }
  if (identValue(tokens[index + 1]) === "in") {
    return true;
  }
  const beforeBracket = tokens[index - 2];
  const indexesValue =
    beforeBracket?.kind === "ident" || isPunct(beforeBracket, ")") || isPunct(beforeBracket, "]");
  return isPunct(previous, "[") && indexesValue;
}

function isComparisonOperand(tokens: readonly PositionedToken[], index: number): boolean {
  const before =
    isPunct(tokens[index - 1], "=") &&
    (isPunct(tokens[index - 2], "=") || isPunct(tokens[index - 2], "!"));
  const after =
    (isPunct(tokens[index + 1], "=") || isPunct(tokens[index + 1], "!")) &&
    isPunct(tokens[index + 2], "=");
  return before || after;
}

function isNonUserFacingPropertyValue(tokens: readonly PositionedToken[], index: number): boolean {
  if (!isPunct(tokens[index - 1], ":") || isTernaryAlternate(tokens, index - 1)) {
    return false;
  }
  const key = tokens[index - 2];
  const name = key?.kind === "ident" || key?.kind === "string" ? key.value : "";
  return isNonUserFacingName(name);
}

function isExcludedPosition(
  tokens: readonly PositionedToken[],
  index: number,
  frames: readonly LiteralFrame[],
): boolean {
  const previousIdent = identValue(tokens[index - 1]);
  return (
    (previousIdent !== undefined && !VALUE_KEYWORDS.has(previousIdent)) ||
    isKeyPosition(tokens, index) ||
    isTypePosition(tokens, index, frames) ||
    isComparisonOperand(tokens, index) ||
    isNonUserFacingArgument(tokens, index, frames) ||
    isNonUserFacingPropertyValue(tokens, index)
  );
}

function attributeAudience(name: string, value: string): boolean {
  if (isNonUserFacingName(name)) {
    return false;
  }
  return USER_FACING_ATTRIBUTES.has(name) ? hasLetters(value) : isProseLike(value);
}

function stringAudience(
  tokens: readonly PositionedToken[],
  index: number,
  frames: readonly LiteralFrame[],
  value: string,
): boolean {
  const previous = tokens[index - 1];
  if (previous?.kind === "markup-attribute") {
    return attributeAudience(previous.name, value);
  }
  const top = frames[frames.length - 1];
  if (top?.kind === "attribute") {
    return attributeAudience(top.name, value);
  }
  return top?.kind === "child" ? hasLetters(value) : isProseLike(value);
}

export function isUntranslatedLiteral(
  tokens: readonly PositionedToken[],
  index: number,
  frames: readonly LiteralFrame[],
  rules: TranslationRecognition,
): boolean {
  const token = tokens[index];
  if (token?.kind !== "string" && token?.kind !== "markup-text") {
    return false;
  }
  if (!hasLetters(token.value) || isUrlLike(token.value)) {
    return false;
  }
  if (frames.some((frame) => isExcludedFrame(frame, rules))) {
    return false;
  }
  if (token.kind === "markup-text") {
    return true;
  }
  if (isDirective(token.value) || isExcludedPosition(tokens, index, frames)) {
    return false;
  }
  return stringAudience(tokens, index, frames, token.value);
}
