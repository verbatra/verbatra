import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReviewQueueRow } from "../client/review-queue-data.js";
import {
  clampIndex,
  classifyShortcutTarget,
  type ReviewShortcutAction,
  resolveReviewShortcut,
  type ShortcutTargetShape,
  stepIndex,
} from "../client/review-shortcuts.js";
import type { RowActions } from "./ReviewTable.js";
import { rowId } from "./use-review-decisions.js";

export interface ActiveRow {
  readonly activeRow: ReviewQueueRow | undefined;
  readonly rowRefs: Map<string, HTMLTableRowElement>;
  readonly activate: (row: ReviewQueueRow) => void;
  readonly move: (delta: number) => void;
  readonly focusActive: () => void;
}

function resolveActiveIndex(
  rows: readonly ReviewQueueRow[],
  active: { readonly id: string; readonly index: number } | null,
): number {
  if (active === null || rows.length === 0) {
    return -1;
  }
  const found = rows.findIndex((row) => rowId(row) === active.id);
  return found >= 0 ? found : clampIndex(active.index, rows.length);
}

export function useActiveRow(rows: readonly ReviewQueueRow[]): ActiveRow {
  const [active, setActive] = useState<{ readonly id: string; readonly index: number } | null>(
    null,
  );
  const rowRefs = useRef(new Map<string, HTMLTableRowElement>()).current;
  const index = resolveActiveIndex(rows, active);
  const activeRow = rows[index];

  function select(next: number): ReviewQueueRow | undefined {
    const row = rows[next];
    if (row !== undefined) {
      setActive({ id: rowId(row), index: next });
    }
    return row;
  }

  return {
    activeRow,
    rowRefs,
    activate: (row) => {
      select(rows.indexOf(row));
    },
    move: (delta) => {
      const row = select(activeRow === undefined ? 0 : stepIndex(index, delta, rows.length));
      if (row !== undefined) {
        rowRefs.get(rowId(row))?.focus();
      }
    },
    focusActive: () => {
      const row = activeRow ?? rows[0];
      if (row !== undefined) {
        rowRefs.get(rowId(row))?.focus();
      }
    },
  };
}

function shortcutTargetOf(target: EventTarget | null): ShortcutTargetShape | null {
  if (!(target instanceof HTMLElement)) {
    return null;
  }
  return {
    tagName: target.tagName,
    type: target.getAttribute("type") ?? "",
    isContentEditable: target.isContentEditable === true,
    inPausedRegion: target.closest("[data-shortcuts-paused]") !== null,
  };
}

export function useReviewShortcuts(
  enabled: boolean,
  onAction: (action: ReviewShortcutAction) => void,
): void {
  const handler = useRef(onAction);
  useLayoutEffect(() => {
    handler.current = onAction;
  });
  useEffect(() => {
    if (!enabled) {
      return;
    }
    function onKeyDown(event: KeyboardEvent): void {
      const action = resolveReviewShortcut({
        key: event.key,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        altKey: event.altKey,
        target: classifyShortcutTarget(shortcutTargetOf(event.target)),
      });
      if (action === null) {
        return;
      }
      event.preventDefault();
      handler.current(action);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
}

function runRowShortcut(
  action: Exclude<ReviewShortcutAction, "next" | "previous" | "help" | "select">,
  row: ReviewQueueRow,
  actions: RowActions,
): void {
  if (
    actions.busyOf(row) !== undefined ||
    (action === "approve" && row.reviewState === "approved")
  ) {
    return;
  }
  const value = actions.currentValueOf(row);
  if (action === "edit") {
    actions.onEdit(row, true);
  } else if (action === "retranslate") {
    actions.onRetranslate?.(row);
  } else if (value !== undefined && action === "approve") {
    actions.onApprove(row, value);
  } else if (value !== undefined) {
    actions.onReject({ locale: row.locale, key: row.key, value });
  }
}

export interface ShortcutContext {
  readonly helpOpen: boolean;
  readonly setHelpOpen: (open: boolean) => void;
  readonly active: ActiveRow;
  readonly canWrite: boolean;
  readonly actions: RowActions;
  readonly toggleSelected: (row: ReviewQueueRow) => void;
}

export function handleShortcut(action: ReviewShortcutAction, context: ShortcutContext): void {
  if (action === "help") {
    context.setHelpOpen(!context.helpOpen);
    return;
  }
  if (context.helpOpen) {
    return;
  }
  if (action === "next" || action === "previous") {
    context.active.move(action === "next" ? 1 : -1);
    return;
  }
  const row = context.active.activeRow;
  if (row === undefined || !context.canWrite) {
    return;
  }
  if (action === "select") {
    context.toggleSelected(row);
  } else {
    runRowShortcut(action, row, context.actions);
  }
}

function isTypingElsewhere(active: Element | null): boolean {
  if (!(active instanceof HTMLElement) || active.closest("tr") !== null) {
    return false;
  }
  const target = classifyShortcutTarget(shortcutTargetOf(active));
  return target === "editable" || target === "paused";
}

export function useSettledFocus(
  ready: boolean,
  focusActive: () => void,
): { readonly request: () => void } {
  const [requested, setRequested] = useState(0);
  const handled = useRef(0);
  useEffect(() => {
    if (requested === handled.current || !ready) {
      return;
    }
    handled.current = requested;
    if (!isTypingElsewhere(document.activeElement)) {
      focusActive();
    }
  });
  return { request: () => setRequested((count) => count + 1) };
}
