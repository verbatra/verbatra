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

export interface RowTarget {
  readonly key: string;
  readonly locale: string;
}

export interface RowBusy {
  readonly action: RowBusyAction;
  readonly elapsedSeconds?: number | undefined;
}

const RETRANSLATE_BUSY_CLASSNAME = "disabled:opacity-100";

const RETRANSLATE_ACTIONS_RESERVED_CLASSNAME = "min-w-106";

function shortcutFor(action: ReviewShortcutAction, active: boolean): string | undefined {
  return active ? shortcutKeysFor(action) : undefined;
}

function ElapsedSlot({ seconds }: { readonly seconds: number | undefined }): ReactNode {
  const className =
    "inline-block min-w-[5ch] text-end font-mono tabular-nums text-muted-foreground";
  if (seconds === undefined) {
    return <span aria-hidden="true" className={className} data-busy-slot="" />;
  }
  return (
    <span className={className} data-busy-elapsed="" data-busy-slot="">
      {compactElapsed(seconds)}
    </span>
  );
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
  target,
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
  readonly target?: RowTarget | undefined;
}): ReactNode {
  const running = busy?.action;
  const label = (action: RowBusyAction, idle: string): string =>
    running === action ? rowBusyLabel(action) : idle;
  const reserve = (action: RowBusyAction, idle: string): string =>
    running === action ? idle : rowBusyLabel(action);
  const named = (visible: string): string | undefined =>
    target === undefined ? undefined : `${visible} ${target.key} (${target.locale})`;
  const reservesBusyWidth = !wrap && onRetranslate !== undefined;
  return (
    <span
      className={cn(
        "relative inline-flex items-center gap-2 whitespace-nowrap",
        wrap ? "flex-wrap" : "flex-nowrap",
        reservesBusyWidth && RETRANSLATE_ACTIONS_RESERVED_CLASSNAME,
      )}
      data-layout={wrap ? "wrap" : "inline"}
      data-reserves-busy={reservesBusyWidth ? "" : undefined}
    >
      <Button
        size="xs"
        onClick={onEdit}
        aria-label={named("Edit")}
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
        aria-label={named(label("approve", "Approve"))}
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
        aria-label={named(label("reject", "Reject…"))}
        disabled={busy !== undefined || decisionDisabled}
        aria-keyshortcuts={shortcutFor("reject", shortcutsActive)}
      >
        {label("reject", "Reject…")}
      </Button>
      {onRetranslate !== undefined ? (
        <Button
          size="xs"
          reserve={reserve("retranslate", "Retranslate")}
          trailing={
            <ElapsedSlot seconds={running === "retranslate" ? busy?.elapsedSeconds : undefined} />
          }
          aria-busy={running === "retranslate" || undefined}
          className={cn(running === "retranslate" && RETRANSLATE_BUSY_CLASSNAME)}
          onClick={onRetranslate}
          aria-label={named(label("retranslate", "Retranslate"))}
          disabled={busy !== undefined}
          aria-keyshortcuts={shortcutFor("retranslate", shortcutsActive)}
        >
          {label("retranslate", "Retranslate")}
        </Button>
      ) : null}
      <span className="sr-only" role="status">
        {busy === undefined ? "" : rowBusyStatus(busy.action, busy.elapsedSeconds)}
      </span>
    </span>
  );
}
