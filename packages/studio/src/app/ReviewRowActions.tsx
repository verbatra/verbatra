import type { ReactNode } from "react";
import {
  compactElapsed,
  type RowBusyAction,
  rowBusyLabel,
  rowBusyStatus,
} from "../client/review-in-flight.js";
import { type ReviewShortcutAction, shortcutKeysFor } from "../client/review-shortcuts.js";
import { Button } from "./Button.js";
import { cn } from "./lib/cn.js";

export interface RowBusy {
  readonly action: RowBusyAction;
  readonly elapsedSeconds?: number | undefined;
}

function shortcutFor(action: ReviewShortcutAction, active: boolean): string | undefined {
  return active ? shortcutKeysFor(action) : undefined;
}

export function ReviewRowActions({
  onApprove,
  onReject,
  onEdit,
  onRetranslate,
  decisionDisabled = false,
  busy,
  shortcutsActive = false,
  wrap = false,
}: {
  readonly onApprove: () => void;
  readonly onReject: () => void;
  readonly onEdit: () => void;
  readonly onRetranslate?: (() => void) | undefined;
  readonly decisionDisabled?: boolean;
  readonly busy?: RowBusy | undefined;
  readonly shortcutsActive?: boolean;
  readonly wrap?: boolean;
}): ReactNode {
  const running = busy?.action;
  const label = (action: RowBusyAction, idle: string): string =>
    running === action ? rowBusyLabel(action) : idle;
  return (
    <span
      className={cn(
        "relative inline-flex items-center gap-2 whitespace-nowrap",
        wrap ? "flex-wrap" : "flex-nowrap",
      )}
    >
      <Button
        onClick={onEdit}
        disabled={busy !== undefined}
        aria-keyshortcuts={shortcutFor("edit", shortcutsActive)}
      >
        Edit
      </Button>
      <Button
        variant="secondary-success"
        className="w-24"
        onClick={onApprove}
        disabled={busy !== undefined || decisionDisabled}
        aria-keyshortcuts={shortcutFor("approve", shortcutsActive)}
      >
        {label("approve", "Approve")}
      </Button>
      <Button
        variant="secondary-danger"
        className="w-24"
        onClick={onReject}
        disabled={busy !== undefined || decisionDisabled}
        aria-keyshortcuts={shortcutFor("reject", shortcutsActive)}
      >
        {label("reject", "Reject…")}
      </Button>
      {onRetranslate !== undefined ? (
        <Button
          className="w-40"
          onClick={onRetranslate}
          disabled={busy !== undefined}
          aria-keyshortcuts={shortcutFor("retranslate", shortcutsActive)}
        >
          {label("retranslate", "Retranslate")}
          {running === "retranslate" && busy?.elapsedSeconds !== undefined ? (
            <>
              {" "}
              <span className="font-mono tabular-nums text-muted-foreground" data-busy-elapsed="">
                {compactElapsed(busy.elapsedSeconds)}
              </span>
            </>
          ) : null}
        </Button>
      ) : null}
      <span className="sr-only" role="status">
        {busy === undefined ? "" : rowBusyStatus(busy.action, busy.elapsedSeconds)}
      </span>
    </span>
  );
}
