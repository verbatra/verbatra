import type { RpcResultFor } from "../shared/rpc/contract.js";
import type { KeyValuePair } from "./filter.js";
import { reviewValuesKey } from "./review-filter.js";
import type { RpcCallResult } from "./rpc-client.js";
import type { FetchOutcome, RefreshableView } from "./state.js";

export type LocaleValuesData = RpcResultFor<"locale.values">;

export function localeValuesOrEmpty(view: RefreshableView<LocaleValuesData>): LocaleValuesData {
  return view.kind === "data" ? view.data : [];
}

export function toLocaleValuesOutcome(
  response: RpcCallResult<"locale.values">,
): FetchOutcome<LocaleValuesData> {
  if (!response.ok) {
    return { ok: false, error: response.error };
  }
  return { ok: true, result: response.result };
}

export function valuesForLocale(
  data: LocaleValuesData,
  locale: string,
): ReadonlyMap<string, KeyValuePair> {
  const entry = data.find((candidate) => candidate.locale === locale);
  return new Map(Object.entries(entry?.values ?? {}));
}

export function valuesIndex(data: LocaleValuesData): ReadonlyMap<string, KeyValuePair> {
  const index = new Map<string, KeyValuePair>();
  for (const entry of data) {
    for (const [key, pair] of Object.entries(entry.values)) {
      index.set(reviewValuesKey(entry.locale, key), pair);
    }
  }
  return index;
}
