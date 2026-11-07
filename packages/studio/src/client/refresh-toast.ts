import type { RefreshEvent, RefreshKeyDelta } from "../shared/sse-events.js";

export interface RefreshToastView {
  readonly category: "source" | "targets";
  readonly label: string;
  readonly summary: string;
  readonly actionEligible: boolean;
}

export interface TranslatePendingCapabilities {
  readonly spend: boolean;
  readonly writeToDisk: boolean;
}

function deltaSum(delta: RefreshKeyDelta): number {
  return delta.added + delta.changed + delta.removed;
}

function buildSummary(delta: RefreshKeyDelta): string {
  const parts: string[] = [];
  if (delta.added > 0) {
    parts.push(`${delta.added} added`);
  }
  if (delta.changed > 0) {
    parts.push(`${delta.changed} changed`);
  }
  if (delta.removed > 0) {
    parts.push(`${delta.removed} removed`);
  }
  return parts.join(", ");
}

function buildLabel(reason: "source" | "targets", locale: string | undefined): string {
  if (reason === "source") {
    return "Source changed";
  }
  return locale !== undefined ? `Target changed: ${locale}` : "Target changed";
}

export function deriveRefreshToastView(event: RefreshEvent): RefreshToastView | undefined {
  if (event.reason === "lock" || event.reason === "git") {
    return undefined;
  }
  if (event.delta === undefined || deltaSum(event.delta) <= 0) {
    return undefined;
  }
  return {
    category: event.reason,
    label: buildLabel(event.reason, event.locale),
    summary: buildSummary(event.delta),
    actionEligible: event.reason === "source",
  };
}

export function canTranslatePending(
  actionEligible: boolean,
  capabilities: TranslatePendingCapabilities | undefined,
): boolean {
  return actionEligible && capabilities?.spend === true && capabilities.writeToDisk;
}

export type ToastSlotAction =
  | { readonly kind: "event"; readonly event: RefreshEvent }
  | { readonly kind: "dismiss" };

export function nextToastSlot(
  _current: RefreshToastView | undefined,
  action: ToastSlotAction,
): RefreshToastView | undefined {
  if (action.kind === "dismiss") {
    return undefined;
  }
  return deriveRefreshToastView(action.event);
}

export type HandledRefreshEvent =
  | { readonly kind: "files"; readonly toast: RefreshToastView | undefined }
  | { readonly kind: "git" };

export function handleRefreshEvent(event: RefreshEvent): HandledRefreshEvent {
  return event.reason === "git"
    ? { kind: "git" }
    : { kind: "files", toast: deriveRefreshToastView(event) };
}
