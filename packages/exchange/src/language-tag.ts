const REGION_SUBTAG = /^[a-z]{2}$/i;

const SCRIPT_SUBTAG = /^[a-z]{4}$/i;

function casedSubtag(subtag: string): string {
  const lower = subtag.toLowerCase();
  if (REGION_SUBTAG.test(subtag)) {
    return subtag.toUpperCase();
  }
  return SCRIPT_SUBTAG.test(subtag) ? `${lower.charAt(0).toUpperCase()}${lower.slice(1)}` : lower;
}

export function bcp47(tag: string): string {
  const [language = "", ...rest] = tag.replaceAll("_", "-").split("-");
  const singleton = rest.findIndex((subtag) => subtag.length === 1);
  const cased = singleton === -1 ? rest.length : singleton;
  return [
    language.toLowerCase(),
    ...rest.slice(0, cased).map(casedSubtag),
    ...rest.slice(cased).map((subtag) => subtag.toLowerCase()),
  ].join("-");
}
