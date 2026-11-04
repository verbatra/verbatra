import { useState } from "react";
import type { KeyStatus } from "../client/key-status-filter.js";
import type { LocaleValuesData } from "../client/locale-values.js";
import { routeParams } from "../client/routes.js";
import type { RefreshableView } from "../client/state.js";
import { useRouteParams } from "./use-route.js";

export type DiffViewMode = "grid" | "flat";

export interface KeyFilterSelection {
  readonly locale: string;
  readonly statuses: ReadonlySet<KeyStatus>;
}

export interface TranslationsRoute extends KeyFilterSelection {
  readonly viewMode: DiffViewMode;
  readonly selectedKey: string | null;
  setViewMode(mode: DiffViewMode): void;
  setFilter(filter: KeyFilterSelection): void;
  setSelectedKey(key: string | null): void;
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

export function useTranslationsRoute(
  knownLocales: readonly string[],
  localeValues: RefreshableView<LocaleValuesData>,
): TranslationsRoute {
  const [params, setParams] = useRouteParams("translations");
  const [chosenViewMode, setChosenViewMode] = useState<DiffViewMode>("grid");

  const locale =
    params.locale !== undefined && knownLocales.includes(params.locale) ? params.locale : "";
  const statuses: ReadonlySet<KeyStatus> = new Set(params.statuses);
  const selectedKey = selectableKey(params.key, localeValues);
  const viewMode = locale !== "" || statuses.size > 0 ? "flat" : chosenViewMode;

  return {
    viewMode,
    locale,
    statuses,
    selectedKey,
    setViewMode(mode) {
      setChosenViewMode(mode);
      if (mode === "grid") {
        setParams(routeParams({ key: selectedKey }));
      }
    },
    setFilter(filter) {
      setChosenViewMode("flat");
      setParams(routeParams({ ...filter, key: selectedKey }));
    },
    setSelectedKey(key) {
      setParams(routeParams({ locale, statuses, key }));
    },
  };
}
