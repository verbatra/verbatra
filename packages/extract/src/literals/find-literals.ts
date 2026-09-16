import { readMarkup } from "../scan/markup.js";
import { type PositionedToken, type SourceComment, scanSource } from "../scan/tokenize.js";
import { isUntranslatedLiteral, type TranslationRecognition } from "./literal-audience.js";
import { type LiteralFrame, updateFrames } from "./literal-frames.js";
import { normalizeLiteralText } from "./literal-text.js";
import { withTranslationAliases } from "./translation-aliases.js";

export interface LiteralRules extends TranslationRecognition {
  readonly extensions: readonly string[];
  readonly markupExtensions: readonly string[];
}

export interface FoundLiteral {
  readonly text: string;
  readonly line: number;
  readonly column: number;
}

export interface FileLiterals {
  readonly found: readonly FoundLiteral[];
  readonly suppressed: readonly FoundLiteral[];
  readonly truncated: boolean;
}

const IGNORE_NEXT_LINE = /verbatra-ignore-next-line(?![\w-])/;

const IGNORE_LINE = /verbatra-ignore-line(?![\w-])/;

function suppressedLines(comments: readonly SourceComment[]): ReadonlySet<number> {
  const lines = new Set<number>();
  for (const comment of comments) {
    if (IGNORE_NEXT_LINE.test(comment.text)) {
      lines.add(comment.endLine + 1);
    } else if (IGNORE_LINE.test(comment.text)) {
      lines.add(comment.line);
    }
  }
  return lines;
}

function toFound(token: PositionedToken & { readonly value: string }): FoundLiteral {
  return { text: normalizeLiteralText(token.value), line: token.line, column: token.column };
}

export function findLiterals(
  content: string,
  rules: TranslationRecognition,
  markup: boolean,
): FileLiterals {
  const scan = scanSource(content, markup ? { markup: readMarkup } : {});
  const recognition = withTranslationAliases(scan.tokens, rules);
  const skipLines = suppressedLines(scan.comments);
  const frames: LiteralFrame[] = [];
  const found: FoundLiteral[] = [];
  const suppressed: FoundLiteral[] = [];
  scan.tokens.forEach((token, index) => {
    if (
      (token.kind === "string" || token.kind === "markup-text") &&
      isUntranslatedLiteral(scan.tokens, index, frames, recognition)
    ) {
      (skipLines.has(token.line) ? suppressed : found).push(toFound(token));
    }
    updateFrames(scan.tokens, index, frames);
  });
  return { found, suppressed, truncated: scan.truncated };
}
