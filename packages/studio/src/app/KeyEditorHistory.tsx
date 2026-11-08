import { Select } from "@verbatra/ui";
import type { ReactNode } from "react";
import { useId } from "react";
import type { CurrentValue, KeyRevisionRow } from "../client/key-history.js";
import { KeyHistoryPanel } from "./KeyHistoryPanel.js";
import type { KeyHistoryRead } from "./use-key-history.js";
import type { KeyHistoryUi } from "./use-key-history-ui.js";

export interface KeyEditorHistoryProps {
  readonly keyName: string;
  readonly locales: readonly string[];
  readonly locale: string | undefined;
  readonly onLocaleChange: (locale: string) => void;
  readonly read: KeyHistoryRead;
  readonly ui: KeyHistoryUi;
  readonly current: CurrentValue;
  readonly onRestore: (locale: string, revision: KeyRevisionRow) => void;
}

export function KeyEditorHistory({
  keyName,
  locales,
  locale,
  onLocaleChange,
  read,
  ui,
  current,
  onRestore,
}: KeyEditorHistoryProps): ReactNode {
  const selectId = useId();
  if (locale === undefined) {
    return <p className="m-0 text-sm text-muted-foreground">This project has no target locales.</p>;
  }
  return (
    <div>
      {locales.length > 1 ? (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <label htmlFor={selectId} className="text-sm text-muted-foreground">
            Locale
          </label>
          <Select
            id={selectId}
            size="sm"
            className="max-md:min-h-11"
            data-focus-id="history-locale"
            value={locale}
            data-history-locale-select=""
            onChange={(event) => onLocaleChange(event.target.value)}
          >
            {locales.map((entry) => (
              <option key={entry} value={entry}>
                {entry}
              </option>
            ))}
          </Select>
        </div>
      ) : null}
      <KeyHistoryPanel
        keyName={keyName}
        locale={locale}
        read={read}
        ui={ui}
        current={current}
        onRestore={(revision) => onRestore(locale, revision)}
      />
    </div>
  );
}
