import { readMarkup } from "./markup.js";
import { isPunct, isPunctIn } from "./token-query.js";
import { type PositionedToken, type SourceScan, type SourceToken, scanSource } from "./tokenize.js";

type OpenTagToken = Extract<PositionedToken, { readonly kind: "markup-open" }>;

type CloseTagToken = Extract<PositionedToken, { readonly kind: "markup-close" }>;

type TemplateToken = Extract<PositionedToken, { readonly kind: "dynamic" }>;

interface Projection {
  readonly text: string;
  readonly lineStarts: readonly number[];
  readonly tokens: readonly PositionedToken[];
  readonly out: SourceToken[];
}

interface OpenTagEnd {
  readonly next: number;
  readonly selfClosed: boolean;
}

const SPREAD_ATTRIBUTE = "...";

const QUOTES = new Set(["'", '"']);

function lineStartsOf(text: string): readonly number[] {
  const starts = [0];
  for (let index = text.indexOf("\n"); index !== -1; index = text.indexOf("\n", index + 1)) {
    starts.push(index + 1);
  }
  return starts;
}

function punct(projection: Projection, value: string, line: number): void {
  projection.out.push({ kind: "punct", value, line });
}

function ident(projection: Projection, value: string, line: number): void {
  if (value !== "") {
    projection.out.push({ kind: "ident", value, line });
  }
}

function lastLine(projection: Projection, fallback: number): number {
  return projection.out[projection.out.length - 1]?.line ?? fallback;
}

function isSelfClosing(projection: Projection, token: CloseTagToken): boolean {
  const offset = (projection.lineStarts[token.line - 1] ?? 0) + token.column - 1;
  return projection.text[offset] === "/";
}

function projectBraces(projection: Projection, start: number, end: number): number {
  let depth = 0;
  let cursor = start;
  do {
    const token = projection.tokens[cursor];
    depth += isPunct(token, "{") ? 1 : 0;
    depth -= isPunct(token, "}") ? 1 : 0;
    cursor = projectAt(projection, cursor, end).next;
  } while (depth > 0 && cursor < end);
  return cursor;
}

function projectElement(projection: Projection, start: number, end: number): number {
  let depth = 0;
  let cursor = start;
  do {
    const token = projection.tokens[cursor];
    const step = projectAt(projection, cursor, end);
    depth += token?.kind === "markup-open" && !step.selfClosed ? 1 : 0;
    depth -= token?.kind === "markup-close" ? 1 : 0;
    cursor = step.next;
  } while (depth > 0 && cursor < end);
  return cursor;
}

function projectAttribute(projection: Projection, index: number, end: number): number {
  const attribute = projection.tokens[index];
  if (attribute?.kind === "markup-attribute" && attribute.name !== SPREAD_ATTRIBUTE) {
    ident(projection, attribute.name, attribute.line);
    punct(projection, "=", attribute.line);
  }
  const value = projection.tokens[index + 1];
  if (value?.kind === "markup-open") {
    return projectElement(projection, index + 1, end);
  }
  return isPunct(value, "{")
    ? projectBraces(projection, index + 1, end)
    : projectAt(projection, index + 1, end).next;
}

function projectOpenTag(
  projection: Projection,
  index: number,
  end: number,
  token: OpenTagToken,
): OpenTagEnd {
  punct(projection, "<", token.line);
  ident(projection, token.name, token.line);
  let cursor = index + 1;
  while (cursor < end && projection.tokens[cursor]?.kind === "markup-attribute") {
    cursor = projectAttribute(projection, cursor, end);
  }
  const closer = projection.tokens[cursor];
  const selfClosed =
    cursor < end && closer?.kind === "markup-close" && isSelfClosing(projection, closer);
  if (selfClosed) {
    punct(projection, "/", closer.line);
  }
  punct(projection, ">", lastLine(projection, token.line));
  return { next: selfClosed ? cursor + 1 : cursor, selfClosed };
}

function projectCloseTag(projection: Projection, token: CloseTagToken): void {
  punct(projection, "<", token.line);
  punct(projection, "/", token.line);
  ident(projection, token.name, token.line);
  punct(projection, ">", token.line);
}

function projectTemplate(projection: Projection, index: number, token: TemplateToken): number {
  const at = projection.out.length;
  const span = token.span ?? 0;
  projection.out.push({ kind: "dynamic", line: token.line });
  projectRange(projection, index + 1, index + 1 + span);
  projection.out[at] = {
    kind: "dynamic",
    line: token.line,
    head: token.head ?? "",
    span: projection.out.length - at - 1,
  };
  return index + 1 + span;
}

function projectAt(projection: Projection, index: number, end: number): OpenTagEnd {
  const token = projection.tokens[index];
  const next = { next: index + 1, selfClosed: false };
  switch (token?.kind) {
    case "markup-open":
      return projectOpenTag(projection, index, end, token);
    case "markup-close":
      projectCloseTag(projection, token);
      return next;
    case "dynamic":
      return { next: projectTemplate(projection, index, token), selfClosed: false };
    case "ident":
    case "string":
    case "punct":
      projection.out.push({ kind: token.kind, value: token.value, line: token.line });
      return next;
    default:
      return next;
  }
}

function projectRange(projection: Projection, start: number, end: number): void {
  let cursor = start;
  while (cursor < end) {
    cursor = projectAt(projection, cursor, end).next;
  }
}

export function tokenizeMarkupSource(text: string): SourceScan {
  const scan = scanSource(text, { markup: readMarkup });
  const projection: Projection = {
    text,
    lineStarts: lineStartsOf(text),
    tokens: scan.tokens,
    out: [],
  };
  projectRange(projection, 0, scan.tokens.length);
  const unterminatedString = projection.out.some((token) => isPunctIn(token, QUOTES));
  return {
    tokens: projection.out,
    truncated: scan.truncated || scan.unreadableMarkup || unterminatedString,
  };
}
