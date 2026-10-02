const LANGUAGE = /^[a-z]{2,3}$/;

const SCRIPT = /^[a-z]{4}$/;

const REGION = /^([a-z]{2}|[0-9]{3})$/;

export const NUMERIC_REGION = /^[0-9]{3}$/;

const VARIANT = /^([a-z0-9]{5,8}|[0-9][a-z0-9]{3})$/;

export interface LocaleTag {
  readonly language: string;
  readonly script: string | undefined;
  readonly region: string | undefined;
  readonly variants: readonly string[];
}

function subtagIf(subtags: readonly string[], index: number, pattern: RegExp): string | undefined {
  const subtag = subtags[index];
  return subtag !== undefined && pattern.test(subtag) ? subtag : undefined;
}

export function parseLocaleTag(locale: string): LocaleTag | undefined {
  const subtags = locale.toLowerCase().split("-");
  const language = subtags[0];
  if (language === undefined || !LANGUAGE.test(language)) {
    return undefined;
  }
  let index = 1;
  const script = subtagIf(subtags, index, SCRIPT);
  index += script === undefined ? 0 : 1;
  const region = subtagIf(subtags, index, REGION);
  index += region === undefined ? 0 : 1;
  const variants = subtags.slice(index);
  if (!variants.every((variant) => VARIANT.test(variant))) {
    return undefined;
  }
  return { language, script, region, variants };
}

export function conventionalSubtags(tag: LocaleTag): readonly string[] {
  const subtags = [tag.language];
  if (tag.script !== undefined) {
    subtags.push(tag.script.charAt(0).toUpperCase() + tag.script.slice(1));
  }
  if (tag.region !== undefined) {
    subtags.push(tag.region.toUpperCase());
  }
  subtags.push(...tag.variants);
  return subtags;
}
