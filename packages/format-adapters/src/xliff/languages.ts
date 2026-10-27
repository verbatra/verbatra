import type { Element } from "@xmldom/xmldom";

export interface DeclaredLanguages {
  readonly source: string | null;
  readonly target: string | null;
}

function declared(element: Element, name: string): string | null {
  const value = element.getAttribute(name)?.trim() ?? "";
  return value === "" ? null : value;
}

export function xliff12Languages(file: Element): DeclaredLanguages {
  return { source: declared(file, "source-language"), target: declared(file, "target-language") };
}

export function xliff20Languages(root: Element): DeclaredLanguages {
  return { source: declared(root, "srcLang"), target: declared(root, "trgLang") };
}

function normalizeTag(tag: string): string {
  return tag.toLowerCase().replaceAll("_", "-");
}

export function isSameLanguage(declaredTag: string, locale: string): boolean {
  const left = normalizeTag(declaredTag);
  const right = normalizeTag(locale);
  if (left === right) {
    return true;
  }
  const bareOnEitherSide = !left.includes("-") || !right.includes("-");
  return bareOnEitherSide && left.split("-")[0] === right.split("-")[0];
}

function declaresLanguage(tag: string | null, locale: string): boolean {
  return tag !== null && isSameLanguage(tag, locale);
}

export function readsTargets(
  languages: DeclaredLanguages,
  locale: string,
  hasTargets: boolean,
): boolean {
  if (declaresLanguage(languages.source, locale)) {
    return declaresLanguage(languages.target, locale);
  }
  if (languages.source !== null || languages.target !== null) {
    return true;
  }
  return hasTargets;
}
