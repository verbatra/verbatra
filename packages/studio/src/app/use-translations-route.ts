import type { KeyStatus } from "../client/key-status-filter.js";
import type { LocaleValuesData } from "../client/locale-values.js";
import { routeParams } from "../client/routes.js";
import type { RefreshableView } from "../client/state.js";
import type { DiffState } from "./use-diff-state.js";
import { useRouteParams } from "./use-route.js";

export interface KeyFilterSelection {
  readonly locale: string;
  readonly statuses: ReadonlySet<KeyStatus>;
}

export interface TranslationsRoute extends KeyFilterSelection {
  readonly selectedKey: string | null;
  readonly query: string;
  setFilter(filter: KeyFilterSelection & { readonly query?: string }): void;
  setSelectedKey(key: string | null): void;
  setQuery(query: string): void;
}

function selectableKey(
  key: string | undefined,
  localeValues: RefreshableView<LocaleValuesData>,
): string | null {
  if (key === undefined) {
    return null;
  }
  if (localeValues.kind === "loading") {
    return null;
  }
  if (localeValues.kind === "error") {
    return key;
  }
  return localeValues.data.some((entry) => Object.hasOwn(entry.values, key)) ? key : null;
}

export function knownLocalesOf(diff: DiffState): readonly string[] | null {
  return diff.kind === "loaded" ? diff.locales.map((entry) => entry.locale) : null;
}

export function useTranslationsRoute(
  knownLocales: readonly string[] | null,
  localeValues: RefreshableView<LocaleValuesData>,
): TranslationsRoute {
  const [params, setParams] = useRouteParams("translations");

  const locale =
    params.locale !== undefined && (knownLocales === null || knownLocales.includes(params.locale))
      ? params.locale
      : "";
  const statuses: ReadonlySet<KeyStatus> = new Set(params.statuses);
  const selectedKey = selectableKey(params.key, localeValues);
  const keptKey = localeValues.kind === "loading" ? (params.key ?? null) : selectedKey;
  const query = params.query ?? "";

  return {
    locale,
    statuses,
    selectedKey,
    query,
    setFilter(filter) {
      setParams(routeParams({ ...filter, key: keptKey, query: filter.query ?? query }));
    },
    setSelectedKey(key) {
      setParams(routeParams({ locale, statuses, key, query }));
    },
    setQuery(next) {
      setParams(routeParams({ locale, statuses, key: keptKey, query: next }));
    },
  };
}
