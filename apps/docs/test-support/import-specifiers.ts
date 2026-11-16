type Token = { readonly kind: "word" | "string" | "punct"; readonly text: string };

const WORD_START = /[A-Za-z_$]/;
const WORD_PART = /[\w$]/;
const REGEX_AFTER_PUNCT = new Set("({[,;:=!&|?+-*%<>~^".split(""));
const REGEX_AFTER_WORD = new Set([
  "return",
  "typeof",
  "case",
  "in",
  "of",
  "delete",
  "void",
  "throw",
  "new",
  "else",
  "do",
]);

function skipTrivia(source: string, start: number): number {
  let index = start;
  while (index < source.length) {
    const here = source[index] ?? "";
    if (/\s/.test(here)) index += 1;
    else if (source.startsWith("//", index))
      index = source.indexOf("\n", index) + 1 || source.length;
    else if (source.startsWith("/*", index))
      index = source.indexOf("*/", index + 2) + 2 || source.length;
    else break;
  }
  return index;
}

function readString(source: string, start: number): { text: string; next: number } {
  const quote = source[start] ?? "";
  let index = start + 1;
  let text = "";
  while (index < source.length) {
    const here = source[index] ?? "";
    if (here === "\\") {
      text += source[index + 1] ?? "";
      index += 2;
    } else if (here === quote) return { text, next: index + 1 };
    else if (here === "\n" && quote !== "`") return { text, next: index };
    else {
      text += here;
      index += 1;
    }
  }
  return { text, next: index };
}

function readRegex(source: string, start: number): number {
  let index = start + 1;
  let inClass = false;
  while (index < source.length) {
    const here = source[index] ?? "";
    if (here === "\\") index += 2;
    else if (here === "\n") return index;
    else if (here === "[") {
      inClass = true;
      index += 1;
    } else if (here === "]") {
      inClass = false;
      index += 1;
    } else if (here === "/" && !inClass) return index + 1;
    else index += 1;
  }
  return index;
}

function startsRegex(previous: Token | undefined): boolean {
  if (previous === undefined) return true;
  if (previous.kind === "punct") return REGEX_AFTER_PUNCT.has(previous.text);
  return previous.kind === "word" && REGEX_AFTER_WORD.has(previous.text);
}

function readWord(source: string, start: number): number {
  let end = start + 1;
  while (end < source.length && WORD_PART.test(source[end] ?? "")) end += 1;
  return end;
}

function nextToken(
  source: string,
  index: number,
  previous: Token | undefined,
): { token: Token; next: number } {
  const here = source[index] ?? "";
  if (here === '"' || here === "'" || here === "`") {
    const { text, next } = readString(source, index);
    return { token: { kind: "string", text }, next };
  }
  if (WORD_START.test(here)) {
    const end = readWord(source, index);
    return { token: { kind: "word", text: source.slice(index, end) }, next: end };
  }
  if (here === "/" && startsRegex(previous))
    return { token: { kind: "punct", text: "regex" }, next: readRegex(source, index) };
  return { token: { kind: "punct", text: here }, next: index + 1 };
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let index = skipTrivia(source, 0);
  while (index < source.length) {
    const { token, next } = nextToken(source, index, tokens.at(-1));
    tokens.push(token);
    index = skipTrivia(source, next);
  }
  return tokens;
}

function stringAt(tokens: Token[], index: number): string | undefined {
  const token = tokens[index];
  return token?.kind === "string" ? token.text : undefined;
}

function isToken(tokens: Token[], index: number, text: string): boolean {
  return tokens[index]?.text === text && tokens[index]?.kind !== "string";
}

function statementStart(tokens: Token[], from: number): number {
  for (let index = from - 1; index >= 0 && from - index < 200; index -= 1) {
    const token = tokens[index];
    if (token?.kind === "word" && (token.text === "import" || token.text === "export"))
      return index;
  }
  return -1;
}

function isTypeSpecifier(specifier: Token[]): boolean {
  return specifier[0]?.text === "type" && specifier.length >= 2 && specifier[1]?.text !== "as";
}

function bracedSpecifiersAreTypes(tokens: Token[], open: number): boolean {
  const specifiers: Token[][] = [[]];
  for (let index = open + 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === undefined || (token.kind === "punct" && token.text === "}")) break;
    if (token.kind === "punct" && token.text === ",") specifiers.push([]);
    else specifiers.at(-1)?.push(token);
  }
  const named = specifiers.filter((specifier) => specifier.length > 0);
  return named.length > 0 && named.every(isTypeSpecifier);
}

function isTypeOnlyStatement(tokens: Token[], from: number): boolean {
  const start = statementStart(tokens, from);
  if (start < 0) return false;
  if (tokens[start + 1]?.text === "type" && tokens[start + 2]?.text !== "from") return true;
  return isToken(tokens, start + 1, "{") && bracedSpecifiersAreTypes(tokens, start + 1);
}

export interface ImportSpecifierOptions {
  readonly skipTypeOnly?: boolean;
}

function specifierAfter(
  tokens: Token[],
  index: number,
  options: ImportSpecifierOptions,
): string | undefined {
  const word = tokens[index];
  if (word?.kind !== "word") return undefined;
  if (word.text === "from") {
    const specifier = stringAt(tokens, index + 1);
    return options.skipTypeOnly === true && isTypeOnlyStatement(tokens, index)
      ? undefined
      : specifier;
  }
  if (word.text === "import")
    return isToken(tokens, index + 1, "(")
      ? stringAt(tokens, index + 2)
      : stringAt(tokens, index + 1);
  if (word.text !== "require") return undefined;
  if (isToken(tokens, index + 1, "(")) return stringAt(tokens, index + 2);
  const resolves =
    isToken(tokens, index + 1, ".") &&
    isToken(tokens, index + 2, "resolve") &&
    isToken(tokens, index + 3, "(");
  return resolves ? stringAt(tokens, index + 4) : undefined;
}

export function importSpecifiers(source: string, options: ImportSpecifierOptions = {}): string[] {
  const tokens = tokenize(source);
  return tokens.flatMap((_, index) => specifierAfter(tokens, index, options) ?? []);
}
