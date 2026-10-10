import {
  conventionalSubtags,
  type LocaleTag,
  NUMERIC_REGION,
  parseLocaleTag,
} from "@verbatra/core";

const SOURCE_SEGMENT = "values";

const MAX_BCP47_SUBTAGS = 4;

const UI_MODE_LANGUAGE_COLLISION = "car";

function needsBcp47(tag: LocaleTag, subtagCount: number): boolean {
  return (
    tag.script !== undefined ||
    tag.variants.length > 0 ||
    (tag.region !== undefined && NUMERIC_REGION.test(tag.region)) ||
    tag.language === UI_MODE_LANGUAGE_COLLISION ||
    subtagCount >= 3
  );
}

function legacySegment(tag: LocaleTag): string {
  return tag.region === undefined
    ? `${SOURCE_SEGMENT}-${tag.language}`
    : `${SOURCE_SEGMENT}-${tag.language}-r${tag.region.toUpperCase()}`;
}

export function androidSegment(locale: string, isSourceLocale: boolean): string | undefined {
  if (isSourceLocale) {
    return SOURCE_SEGMENT;
  }
  const tag = parseLocaleTag(locale);
  if (tag === undefined) {
    return undefined;
  }
  const subtags = conventionalSubtags(tag);
  if (!needsBcp47(tag, subtags.length)) {
    return legacySegment(tag);
  }
  if (subtags.length > MAX_BCP47_SUBTAGS) {
    return undefined;
  }
  return `${SOURCE_SEGMENT}-b+${subtags.join("+")}`;
}
