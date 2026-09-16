export const URL_ATTRIBUTES: ReadonlySet<string> = new Set([
  "action",
  "archive",
  "background",
  "by",
  "cite",
  "codebase",
  "data",
  "formaction",
  "from",
  "href",
  "longdesc",
  "manifest",
  "ping",
  "poster",
  "src",
  "srcset",
  "to",
  "values",
  "xlink:href",
]);

const LIST_SEPARATORS: Readonly<Record<string, RegExp>> = {
  archive: /[\s,]+/,
  ping: /\s+/,
  srcset: /,/,
  values: /;/,
};

const NUMERIC_REFERENCE = /&#(?:[xX]([0-9a-fA-F]+)|([0-9]+));?/g;
const NAMED_REFERENCE = /&(colon|tab|newline|sol|bsol);?/gi;
const TAB_OR_NEWLINE = /[\t\n\r]/g;
const EMBEDDED_SCHEME = /(?:^|[^a-z0-9+.-])(javascript|vbscript|data):/;
const LEADING_SCHEME = /^(javascript|vbscript|data):/;
const SCHEME = /^([a-z][a-z0-9+.-]*):/;
const LEADING_SLASHES = /^[/\\]*/;
const AUTHORITY_END = /[/\\?#]/;
const NON_SPECIAL_AUTHORITY_END = /[/?#]/;
const BACKSLASH = /\\|%5c/;
const SPECIAL_SCHEMES: ReadonlySet<string> = new Set(["file", "ftp", "http", "https", "ws", "wss"]);
const REPLACEMENT_CHARACTER = "�";

function decodeNumeric(
  _match: string,
  hex: string | undefined,
  decimal: string | undefined,
): string {
  const codePoint = hex === undefined ? Number(decimal) : Number.parseInt(hex, 16);
  const isSurrogate = codePoint >= 0xd800 && codePoint <= 0xdfff;
  if (codePoint === 0 || codePoint > 0x10ffff || isSurrogate) {
    return REPLACEMENT_CHARACTER;
  }
  return String.fromCodePoint(codePoint);
}

function decodeNamed(_match: string, name: string): string {
  switch (name.toLowerCase()) {
    case "colon":
      return ":";
    case "tab":
      return "\t";
    case "newline":
      return "\n";
    case "sol":
      return "/";
    default:
      return "\\";
  }
}

export function decodeReferences(raw: string): string {
  return raw.replace(NUMERIC_REFERENCE, decodeNumeric).replace(NAMED_REFERENCE, decodeNamed);
}

function withoutControlsOrSpaces(text: string): string {
  let kept = "";
  for (const character of text) {
    if (character.charCodeAt(0) > 32) {
      kept += character;
    }
  }
  return kept;
}

function trimControlsOrSpaces(text: string): string {
  let start = 0;
  let end = text.length;
  while (start < end && text.charCodeAt(start) <= 32) {
    start += 1;
  }
  while (end > start && text.charCodeAt(end - 1) <= 32) {
    end -= 1;
  }
  return text.slice(start, end);
}

export function isUrlAttribute(attributeName: string): boolean {
  return URL_ATTRIBUTES.has(attributeName.toLowerCase());
}

export function dangerousScheme(raw: string): string | undefined {
  const decoded = decodeReferences(raw).toLowerCase();
  return (
    LEADING_SCHEME.exec(withoutControlsOrSpaces(decoded))?.[1] ??
    EMBEDDED_SCHEME.exec(decoded.replace(TAB_OR_NEWLINE, ""))?.[1]
  );
}

export function urlsIn(attributeName: string, raw: string): readonly string[] {
  const name = attributeName.toLowerCase();
  const separator = LIST_SEPARATORS[name];
  const decoded = decodeReferences(raw);
  if (separator === undefined) {
    return [decoded];
  }
  const parts = decoded.split(separator).map(trimControlsOrSpaces);
  const urls = name === "srcset" ? parts.map((part) => part.split(/\s+/, 1).join("")) : parts;
  return urls.filter((url) => url.length > 0);
}

function readsBackslashAsHost(slashes: string, afterSlashes: string): boolean {
  const end = afterSlashes.search(NON_SPECIAL_AUTHORITY_END);
  const authority = end === -1 ? afterSlashes : afterSlashes.slice(0, end);
  return BACKSLASH.test(slashes) || BACKSLASH.test(authority);
}

export function urlOrigin(decodedUrl: string): string {
  const url = trimControlsOrSpaces(decodedUrl.replace(TAB_OR_NEWLINE, "")).toLowerCase();
  const scheme = SCHEME.exec(url)?.[1];
  const rest = scheme === undefined ? url : url.slice(scheme.length + 1);
  const slashes = rest.length - rest.replace(LEADING_SLASHES, "").length;
  if (scheme === undefined && slashes < 2) {
    return "./";
  }
  const afterSlashes = rest.slice(slashes);
  if (
    !SPECIAL_SCHEMES.has(scheme ?? "") &&
    readsBackslashAsHost(rest.slice(0, slashes), afterSlashes)
  ) {
    return url;
  }
  const end = afterSlashes.search(AUTHORITY_END);
  const authority = end === -1 ? afterSlashes : afterSlashes.slice(0, end);
  return scheme === undefined ? `//${authority}` : `${scheme}://${authority}`;
}
