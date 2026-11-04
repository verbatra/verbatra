import type { KeyProvenance } from "@verbatra/sdk";
export const MAX_RENDERED_KEYS = 500;

export interface CappedKeyList {
  readonly items: readonly string[];
  readonly totalMatches: number;
  readonly truncated: boolean;
}

export interface KeyValuePair {
  readonly source?: string;
  readonly target?: string;
  readonly provenance?: KeyProvenance;
}

export interface KeyPairLookup {
  get(key: string): KeyValuePair | undefined;
}

function valueMatches(key: string, needle: string, values: KeyPairLookup | undefined): boolean {
  const pair = values?.get(key);
  if (pair === undefined) {
    return false;
  }
  return (
    (pair.source?.toLowerCase().includes(needle) ?? false) ||
    (pair.target?.toLowerCase().includes(needle) ?? false)
  );
}

export function keyMatchesQuery(key: string, query: string, values?: KeyPairLookup): boolean {
  const needle = query.trim().toLowerCase();
  return needle === "" || key.toLowerCase().includes(needle) || valueMatches(key, needle, values);
}

export function filterAndCapKeys(
  keys: readonly string[],
  query: string,
  values?: KeyPairLookup,
): CappedKeyList {
  const matches =
    query.trim() === "" ? keys : keys.filter((key) => keyMatchesQuery(key, query, values));
  return {
    items: matches.slice(0, MAX_RENDERED_KEYS),
    totalMatches: matches.length,
    truncated: matches.length > MAX_RENDERED_KEYS,
  };
}
