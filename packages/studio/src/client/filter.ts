export const MAX_RENDERED_KEYS = 500;

export interface CappedKeyList {
  readonly items: readonly string[];
  readonly totalMatches: number;
  readonly truncated: boolean;
}

export interface KeyValuePair {
  readonly source?: string;
  readonly target?: string;
}

function valueMatches(
  key: string,
  needle: string,
  values: ReadonlyMap<string, KeyValuePair> | undefined,
): boolean {
  const pair = values?.get(key);
  if (pair === undefined) {
    return false;
  }
  return (
    (pair.source?.toLowerCase().includes(needle) ?? false) ||
    (pair.target?.toLowerCase().includes(needle) ?? false)
  );
}

export function filterAndCapKeys(
  keys: readonly string[],
  query: string,
  values?: ReadonlyMap<string, KeyValuePair>,
): CappedKeyList {
  const needle = query.trim().toLowerCase();
  const matches =
    needle === ""
      ? keys
      : keys.filter(
          (key) => key.toLowerCase().includes(needle) || valueMatches(key, needle, values),
        );
  return {
    items: matches.slice(0, MAX_RENDERED_KEYS),
    totalMatches: matches.length,
    truncated: matches.length > MAX_RENDERED_KEYS,
  };
}
