import type { InlineTag, MarkupAttribute } from "./markup-scanner.js";

const URL_ATTRIBUTES: ReadonlySet<string> = new Set([
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

const NUMERIC_REFERENCE = /&#(?:[xX]([0-9a-fA-F]+)|([0-9]+));?/g;
const NAMED_REFERENCE = /&(colon|tab|newline);?/gi;
const TAB_OR_NEWLINE = /[\t\n\r]/g;
const EMBEDDED_SCHEME = /(?:^|[^a-z0-9+.-])(javascript|vbscript|data):/;
const LEADING_SCHEME = /^(javascript|vbscript|data):/;
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
  const lower = name.toLowerCase();
  if (lower === "colon") {
    return ":";
  }
  return lower === "tab" ? "\t" : "\n";
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

function dangerousScheme(raw: string): string | undefined {
  const decoded = raw
    .replace(NUMERIC_REFERENCE, decodeNumeric)
    .replace(NAMED_REFERENCE, decodeNamed)
    .toLowerCase();
  return (
    LEADING_SCHEME.exec(withoutControlsOrSpaces(decoded))?.[1] ??
    EMBEDDED_SCHEME.exec(decoded.replace(TAB_OR_NEWLINE, ""))?.[1]
  );
}

function valueKey(tagName: string, attributeName: string): string {
  return `${tagName.toLowerCase()} ${attributeName.toLowerCase()}`;
}

function sourceValues(tags: readonly InlineTag[]): ReadonlyMap<string, ReadonlySet<string>> {
  const values = new Map<string, Set<string>>();
  for (const tag of tags) {
    for (const attribute of tag.attributes) {
      const key = valueKey(tag.name, attribute.name);
      const known = values.get(key) ?? new Set<string>();
      known.add(attribute.value);
      values.set(key, known);
    }
  }
  return values;
}

function mustMatchSource(attributeName: string): boolean {
  const name = attributeName.toLowerCase();
  return name === "srcdoc" || name.startsWith("on");
}

function attributeFinding(
  tag: InlineTag,
  attribute: MarkupAttribute,
  sourceCarriesName: boolean,
): string | undefined {
  if (mustMatchSource(attribute.name)) {
    return sourceCarriesName ? `<${tag.name} ${attribute.name}="...">` : undefined;
  }
  if (!URL_ATTRIBUTES.has(attribute.name.toLowerCase())) {
    return undefined;
  }
  const scheme = dangerousScheme(attribute.value);
  return scheme === undefined ? undefined : `<${tag.name} ${attribute.name}="${scheme}:...">`;
}

export function unsafeAttributeValues(
  sourceTags: readonly InlineTag[],
  translatedTags: readonly InlineTag[],
): readonly string[] {
  const allowed = sourceValues(sourceTags);
  const findings: string[] = [];
  for (const tag of translatedTags) {
    for (const attribute of tag.attributes) {
      const known = allowed.get(valueKey(tag.name, attribute.name));
      if (known?.has(attribute.value) === true) {
        continue;
      }
      const finding = attributeFinding(tag, attribute, known !== undefined);
      if (finding !== undefined) {
        findings.push(finding);
      }
    }
  }
  return findings;
}
