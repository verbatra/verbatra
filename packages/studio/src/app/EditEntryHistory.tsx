import { Button } from "@verbatra/ui";
import type { ReactNode } from "react";
import { useId, useState } from "react";
import type { CurrentValue, KeyRevisionRow } from "../client/key-history.js";
import { KeyHistoryPanel } from "./KeyHistoryPanel.js";
import { useKeyHistory } from "./use-key-history.js";
import { useKeyHistoryUi } from "./use-key-history-ui.js";

interface EditEntryHistoryProps {
  readonly locale: string;
  readonly keyName: string;
  readonly current: CurrentValue;
  readonly refreshToken: number;
  readonly onRestore: (revision: KeyRevisionRow) => void;
}

function OpenHistory({
  locale,
  keyName,
  current,
  refreshToken,
  onRestore,
  id,
}: EditEntryHistoryProps & { readonly id: string }): ReactNode {
  const ui = useKeyHistoryUi(locale, keyName);
  const read = useKeyHistory({ enabled: true, locale, keyName, refreshToken, limit: ui.limit });
  return (
    <div id={id} className="mt-3">
      <KeyHistoryPanel
        keyName={keyName}
        locale={locale}
        read={read}
        ui={ui}
        current={current}
        onRestore={onRestore}
      />
    </div>
  );
}

export function EditEntryHistory(props: EditEntryHistoryProps): ReactNode {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <div className="mt-6" data-edit-history="">
      <Button
        size="sm"
        className="max-md:min-h-11"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        data-edit-history-toggle=""
        onClick={() => setOpen((value) => !value)}
      >
        {open ? "Hide history" : "Show history"}
      </Button>
      {open ? <OpenHistory {...props} id={panelId} /> : null}
    </div>
  );
}
