import type { LocaleValues } from "@verbatra/sdk";
import type { RpcResultFor } from "../shared/rpc/contract.js";
import type { KeyValuePair } from "./filter.js";
import { reviewValuesKey } from "./review-filter.js";
import type { RpcCallResult } from "./rpc-client.js";
import type { FetchOutcome, RefreshableView } from "./state.js";

export type LocaleValuesData = readonly LocaleValues[];

const PAGED_RESULT_ERROR = {
  code: "UNEXPECTED_RESULT",
  message: "Studio asked for every locale value and received a single page instead.",
} as const;

function isEveryLocaleValue(result: RpcResultFor<"locale.values">): result is LocaleValuesData {
  return Array.isArray(result);
}

export function localeValuesOrEmpty(view: RefreshableView<LocaleValuesData>): LocaleValuesData {
  return view.kind === "data" ? view.data : [];
}

export function toLocaleValuesOutcome(
  response: RpcCallResult<"locale.values">,
): FetchOutcome<LocaleValuesData> {
  if (!response.ok) {
    return { ok: false, error: response.error };
  }
  if (!isEveryLocaleValue(response.result)) {
    return { ok: false, error: PAGED_RESULT_ERROR };
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
