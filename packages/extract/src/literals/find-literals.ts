import { readMarkup } from "../scan/markup.js";
import { type PositionedToken, scanSource } from "../scan/tokenize.js";
import { isUntranslatedLiteral, type TranslationRecognition } from "./literal-audience.js";
import { directiveSuppression } from "./literal-directives.js";
import { type LiteralFrame, updateFrames } from "./literal-frames.js";
import { decodeCharacterReferences, normalizeLiteralText } from "./literal-text.js";
import { translationRecognitionAt } from "./translation-aliases.js";

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

function toFound(
  token: PositionedToken & { readonly value: string },
  markupValue: boolean,
): FoundLiteral {
  const text = markupValue ? decodeCharacterReferences(token.value) : token.value;
  return { text: normalizeLiteralText(text), line: token.line, column: token.column };
}

export function findLiterals(
  content: string,
  rules: TranslationRecognition,
  markup: boolean,
): FileLiterals {
  const scan = scanSource(content, markup ? { markup: readMarkup } : {});
  const recognitionAt = translationRecognitionAt(scan.tokens, rules);
  const isSuppressed = directiveSuppression(scan);
  const frames: LiteralFrame[] = [];
  const found: FoundLiteral[] = [];
  const suppressed: FoundLiteral[] = [];
  scan.tokens.forEach((token, index) => {
    if (
      (token.kind === "string" || token.kind === "markup-text") &&
      isUntranslatedLiteral(scan.tokens, index, frames, recognitionAt(index))
    ) {
      (isSuppressed(token, index) ? suppressed : found).push(
        toFound(
          token,
          token.kind === "markup-text" || scan.tokens[index - 1]?.kind === "markup-attribute",
        ),
      );
    }
    updateFrames(scan.tokens, index, frames);
  });
  return { found, suppressed, truncated: scan.truncated || scan.unreadableMarkup };
}
