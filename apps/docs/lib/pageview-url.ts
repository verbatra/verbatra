export const MAX_UTM_LENGTH = 255;

export const FORWARDED_UTM_PARAMETERS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
] as const;

function capUtmValue(value: string): string {
  const capped = value.slice(0, MAX_UTM_LENGTH);
  return /[\uD800-\uDBFF]$/.test(capped) ? capped.slice(0, -1) : capped;
}

export function pageviewUrl(requestUrl: string): string {
  const { pathname, searchParams } = new URL(requestUrl);
  const forwarded = new URLSearchParams();
  for (const name of FORWARDED_UTM_PARAMETERS) {
    const value = searchParams.getAll(name).find((candidate) => candidate !== "");
    if (value !== undefined) forwarded.set(name, capUtmValue(value));
  }
  const query = forwarded.toString();
  return query === "" ? pathname : `${pathname}?${query}`;
}
