import type { InlineTag, MarkupAttribute } from "./markup-scanner.js";
import { dangerousScheme, isUrlAttribute, urlOrigin, urlsIn } from "./url-attributes.js";

interface SourceAttribute {
  readonly values: Set<string>;
  readonly origins: Set<string>;
}

type SourceAttributes = ReadonlyMap<string, SourceAttribute>;

function valueKey(tagName: string, attributeName: string): string {
  return `${tagName.toLowerCase()} ${attributeName.toLowerCase()}`;
}

function originsOf(attribute: MarkupAttribute): readonly string[] {
  return isUrlAttribute(attribute.name)
    ? urlsIn(attribute.name, attribute.value).map(urlOrigin)
    : [];
}

function sourceAttributes(tags: readonly InlineTag[]): SourceAttributes {
  const attributes = new Map<string, SourceAttribute>();
  for (const tag of tags) {
    for (const attribute of tag.attributes) {
      const key = valueKey(tag.name, attribute.name);
      const known = attributes.get(key) ?? {
        values: new Set<string>(),
        origins: new Set<string>(),
      };
      known.values.add(attribute.value);
      for (const origin of originsOf(attribute)) {
        known.origins.add(origin);
      }
      attributes.set(key, known);
    }
  }
  return attributes;
}

function mustMatchSource(attributeName: string): boolean {
  const name = attributeName.toLowerCase();
  return name === "srcdoc" || name.startsWith("on");
}

function urlFinding(
  tag: InlineTag,
  attribute: MarkupAttribute,
  source: SourceAttribute | undefined,
): string | undefined {
  const scheme = dangerousScheme(attribute.value);
  if (scheme !== undefined) {
    return `<${tag.name} ${attribute.name}="${scheme}:...">`;
  }
  const moved = originsOf(attribute).find((origin) => source?.origins.has(origin) === false);
  return moved === undefined ? undefined : `<${tag.name} ${attribute.name}="${moved}...">`;
}

function attributeFinding(
  tag: InlineTag,
  attribute: MarkupAttribute,
  source: SourceAttribute | undefined,
): string | undefined {
  if (mustMatchSource(attribute.name)) {
    return source === undefined ? undefined : `<${tag.name} ${attribute.name}="...">`;
  }
  return isUrlAttribute(attribute.name) ? urlFinding(tag, attribute, source) : undefined;
}

export function unsafeAttributeValues(
  sourceTags: readonly InlineTag[],
  translatedTags: readonly InlineTag[],
): readonly string[] {
  const source = sourceAttributes(sourceTags);
  const findings: string[] = [];
  for (const tag of translatedTags) {
    for (const attribute of tag.attributes) {
      const known = source.get(valueKey(tag.name, attribute.name));
      if (known?.values.has(attribute.value) === true) {
        continue;
      }
      const finding = attributeFinding(tag, attribute, known);
      if (finding !== undefined) {
        findings.push(finding);
      }
    }
  }
  return findings;
}
