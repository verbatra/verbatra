import { countTokens, multisetExcess } from "./multiset.js";
import {
  PRINTF_CONVERSION,
  PRINTF_FLAGS_WIDTH_PRECISION,
  PRINTF_LENGTH,
  PRINTF_POSITION,
} from "./printf-syntax.js";

export const PLACEHOLDER_SYNTAXES = [
  "double-brace",
  "single-brace",
  "printf",
  "python-named",
  "ruby",
  "dollar-brace",
] as const;

export type PlaceholderSyntax = (typeof PLACEHOLDER_SYNTAXES)[number];

const IDENTIFIER = "(?:\\p{Nd}+|[\\p{L}_$][\\p{L}\\p{M}\\p{Nd}_$.-]*)";

const ICU_ARGUMENT_TYPES =
  "(?:plural|selectordinal|select|number|date|time|spellout|ordinal|duration|choice)";

const NOT_IN_A_WORD_BEFORE = "(?<![A-Za-z0-9])";

const NOT_IN_A_WORD_AFTER = "(?![A-Za-z0-9])";

const NOT_A_PERCENT_ENCODED_BYTE = "(?![0-9][A-Fa-f])";

const SYNTAX_GROUPS: readonly (readonly [string, PlaceholderSyntax])[] = [
  ["doubleBrace", "double-brace"],
  ["ruby", "ruby"],
  ["dollarBrace", "dollar-brace"],
  ["pythonNamed", "python-named"],
  ["printf", "printf"],
  ["icuArgument", "single-brace"],
  ["singleBrace", "single-brace"],
];

const PLACEHOLDER_TOKEN = new RegExp(
  [
    "(?<escape>%%)",
    `(?<doubleBrace>\\{\\{\\s*(?:-\\s*)?${IDENTIFIER}(?:\\s*,[^{}]*)?\\s*\\}\\})`,
    `(?<ruby>%\\{${IDENTIFIER}\\})`,
    `(?<dollarBrace>\\$\\{${IDENTIFIER}\\})`,
    `(?<pythonNamed>%\\(\\w+\\)${PRINTF_FLAGS_WIDTH_PRECISION}${PRINTF_CONVERSION}${NOT_IN_A_WORD_AFTER})`,
    `(?<printf>${NOT_IN_A_WORD_BEFORE}%${NOT_A_PERCENT_ENCODED_BYTE}${PRINTF_POSITION}${PRINTF_FLAGS_WIDTH_PRECISION}${PRINTF_LENGTH}${PRINTF_CONVERSION}${NOT_IN_A_WORD_AFTER})`,
    `(?<icuArgument>\\{\\s*${IDENTIFIER}\\s*,\\s*${ICU_ARGUMENT_TYPES}\\s*[,}])`,
    `(?<singleBrace>\\{${IDENTIFIER}\\})`,
  ].join("|"),
  "uy",
);

const TOKEN_START = /[{%$]/g;

const URL_SEPARATOR = "://";

const WHITESPACE = /\s/;

function syntaxOf(match: RegExpExecArray): PlaceholderSyntax | undefined {
  for (const [group, syntax] of SYNTAX_GROUPS) {
    if (match.groups?.[group] !== undefined) {
      return syntax;
    }
  }
  return undefined;
}

function closingBraceEnd(value: string, open: number): number {
  let depth = 0;
  for (let index = open; index < value.length; index += 1) {
    const char = value.charAt(index);
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return index + 1;
      }
    }
  }
  return value.length;
}

function tokenEnd(value: string, match: RegExpExecArray): number {
  return match.groups?.icuArgument === undefined
    ? match.index + match[0].length
    : closingBraceEnd(value, match.index);
}

function isWhitespaceAt(value: string, index: number): boolean {
  return WHITESPACE.test(value.charAt(index));
}

function runStart(value: string, index: number): number {
  let start = index;
  while (start > 0 && !isWhitespaceAt(value, start - 1)) {
    start -= 1;
  }
  return start;
}

function runEnd(value: string, index: number): number {
  let end = index;
  while (end < value.length && !isWhitespaceAt(value, end)) {
    end += 1;
  }
  return end;
}

function withoutUrls(value: string): string {
  let scanned = "";
  let copied = 0;
  let separator = value.indexOf(URL_SEPARATOR);
  while (separator !== -1) {
    const start = runStart(value, separator);
    const end = runEnd(value, separator + URL_SEPARATOR.length);
    scanned += value.slice(copied, start) + " ".repeat(end - start);
    copied = end;
    separator = value.indexOf(URL_SEPARATOR, end);
  }
  return scanned + value.slice(copied);
}

export function foreignPlaceholderTokens(
  value: string,
  nativeSyntaxes: readonly PlaceholderSyntax[],
): readonly string[] {
  const native = new Set(nativeSyntaxes);
  const scanned = withoutUrls(value);
  const tokens: string[] = [];
  TOKEN_START.lastIndex = 0;
  let start = TOKEN_START.exec(scanned);
  while (start !== null) {
    PLACEHOLDER_TOKEN.lastIndex = start.index;
    const match = PLACEHOLDER_TOKEN.exec(scanned);
    if (match !== null) {
      const syntax = syntaxOf(match);
      if (syntax !== undefined && !native.has(syntax)) {
        tokens.push(match[0]);
      }
      TOKEN_START.lastIndex = tokenEnd(scanned, match);
    }
    start = TOKEN_START.exec(scanned);
  }
  return tokens;
}

export function missingForeignPlaceholders(
  source: string,
  target: string,
  nativeSyntaxes: readonly PlaceholderSyntax[],
): readonly string[] {
  const inSource = foreignPlaceholderTokens(source, nativeSyntaxes);
  if (inSource.length === 0) {
    return [];
  }
  return multisetExcess(
    countTokens(inSource),
    countTokens(foreignPlaceholderTokens(target, nativeSyntaxes)),
  );
}
