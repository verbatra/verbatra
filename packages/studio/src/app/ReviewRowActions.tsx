import { Button } from "@verbatra/ui";
import type { ReactNode } from "react";
import {
  compactElapsed,
  type RowBusyAction,
  rowBusyLabel,
  rowBusyStatus,
} from "../client/review-in-flight.js";
import { type ReviewShortcutAction, shortcutKeysFor } from "../client/review-shortcuts.js";
import { cn } from "./lib/cn.js";

export interface RowBusy {
  readonly action: RowBusyAction;
  readonly elapsedSeconds?: number | undefined;
}

const RETRANSLATE_BUSY_CLASSNAME = "disabled:opacity-100";

const RETRANSLATE_WIDEST_LABEL = "Retranslating… 12:34";

const RETRANSLATE_ACTIONS_RESERVED_CLASSNAME = "min-w-106";

function shortcutFor(action: ReviewShortcutAction, active: boolean): string | undefined {
  return active ? shortcutKeysFor(action) : undefined;
}

export function ReviewRowActions({
  onApprove,
  onReject,
  onEdit,
  onRetranslate,
  decisionDisabled = false,
  approveDisabled = false,
  busy,
  shortcutsActive = false,
  wrap = false,
}: {
  readonly onApprove: () => void;
  readonly onReject: () => void;
  readonly onEdit: () => void;
  readonly onRetranslate?: (() => void) | undefined;
  readonly decisionDisabled?: boolean;
  readonly approveDisabled?: boolean;
  readonly busy?: RowBusy | undefined;
  readonly shortcutsActive?: boolean;
  readonly wrap?: boolean;
}): ReactNode {
  const running = busy?.action;
  const label = (action: RowBusyAction, idle: string): string =>
    running === action ? rowBusyLabel(action) : idle;
  const reserve = (action: RowBusyAction, idle: string): string =>
    running === action ? idle : rowBusyLabel(action);
  return (
    <span
      className={cn(
        "relative inline-flex items-center gap-2 whitespace-nowrap",
        wrap ? "flex-wrap" : "flex-nowrap",
        !wrap && onRetranslate !== undefined && RETRANSLATE_ACTIONS_RESERVED_CLASSNAME,
      )}
    >
      <Button
        size="xs"
        onClick={onEdit}
        disabled={busy !== undefined}
        aria-keyshortcuts={shortcutFor("edit", shortcutsActive)}
      >
        Edit
      </Button>
      <Button
        variant="secondary-success"
        size="xs"
        reserve={reserve("approve", "Approve")}
        aria-busy={running === "approve" || undefined}
        onClick={onApprove}
        disabled={busy !== undefined || decisionDisabled || approveDisabled}
        aria-keyshortcuts={shortcutFor("approve", shortcutsActive)}
      >
        {label("approve", "Approve")}
      </Button>
      <Button
        variant="secondary-danger"
        size="xs"
        reserve={reserve("reject", "Reject…")}
        aria-busy={running === "reject" || undefined}
        onClick={onReject}
        disabled={busy !== undefined || decisionDisabled}
        aria-keyshortcuts={shortcutFor("reject", shortcutsActive)}
      >
        {label("reject", "Reject…")}
      </Button>
      {onRetranslate !== undefined ? (
        <Button
          size="xs"
          reserve={RETRANSLATE_WIDEST_LABEL}
          aria-busy={running === "retranslate" || undefined}
          className={cn(running === "retranslate" && RETRANSLATE_BUSY_CLASSNAME)}
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
