import type { PositionedScan, PositionedToken, SourceComment } from "../scan/tokenize.js";

const IGNORE_NEXT_LINE = /verbatra-ignore-next-line(?![\w-])/;

const IGNORE_LINE = /verbatra-ignore-line(?![\w-])/;

interface TokenRange {
  readonly first: number;
  readonly last: number;
}

export type DirectiveCheck = (token: PositionedToken, index: number) => boolean;

function nextTokenLine(tokens: readonly PositionedToken[], afterLine: number): number | undefined {
  return tokens.find((token) => token.line > afterLine)?.line;
}

function elementEnd(tokens: readonly PositionedToken[], openIndex: number): number {
  let depth = 0;
  for (let index = openIndex; index < tokens.length; index += 1) {
    const kind = tokens[index]?.kind;
    if (kind === "markup-open") {
      depth += 1;
    } else if (kind === "markup-close") {
      depth -= 1;
    }
    if (depth === 0) {
      return index;
    }
  }
  return tokens.length - 1;
}

function elementsStartingOn(tokens: readonly PositionedToken[], line: number): TokenRange[] {
  const ranges: TokenRange[] = [];
  tokens.forEach((token, index) => {
    if (token.kind === "markup-open" && token.line === line) {
      ranges.push({ first: index, last: elementEnd(tokens, index) });
    }
  });
  return ranges;
}

function suppressNextLine(
  tokens: readonly PositionedToken[],
  comment: SourceComment,
  lines: Set<number>,
  ranges: TokenRange[],
): void {
  const line = nextTokenLine(tokens, comment.endLine);
  if (line !== undefined) {
    lines.add(line);
    ranges.push(...elementsStartingOn(tokens, line));
  }
}

export function directiveSuppression(scan: PositionedScan): DirectiveCheck {
  const lines = new Set<number>();
  const ranges: TokenRange[] = [];
  for (const comment of scan.comments) {
    if (IGNORE_NEXT_LINE.test(comment.text)) {
      suppressNextLine(scan.tokens, comment, lines, ranges);
    } else if (IGNORE_LINE.test(comment.text)) {
      lines.add(comment.line);
    }
  }
  return (token, index) =>
    lines.has(token.line) || ranges.some((range) => index >= range.first && index <= range.last);
}
