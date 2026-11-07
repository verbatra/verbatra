import { Select } from "@verbatra/ui";
import type { ReactNode } from "react";
import { useId } from "react";
import { KeyHistoryPanel } from "./KeyHistoryPanel.js";
import type { KeyHistoryRead } from "./use-key-history.js";

export interface KeyEditorHistoryProps {
  readonly keyName: string;
  readonly locales: readonly string[];
  readonly locale: string | undefined;
  readonly onLocaleChange: (locale: string) => void;
  readonly read: KeyHistoryRead;
  readonly current: string | undefined;
  readonly canWrite: boolean;
  readonly onRestore: (locale: string, value: string) => void;
}

export function KeyEditorHistory({
  keyName,
  locales,
  locale,
  onLocaleChange,
  read,
  current,
  canWrite,
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
        current={current}
        canWrite={canWrite}
        onRestore={(value) => onRestore(locale, value)}
      />
    </div>
  );
}
