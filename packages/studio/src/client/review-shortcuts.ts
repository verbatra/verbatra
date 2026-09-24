export type ReviewShortcutAction =
  | "next"
  | "previous"
  | "approve"
  | "reject"
  | "edit"
  | "retranslate"
  | "help";

export interface ReviewShortcut {
  readonly action: ReviewShortcutAction;
  readonly keys: readonly string[];
  readonly label: string;
  readonly needsSpend: boolean;
}

const SHORTCUT_KEYS: Readonly<Record<ReviewShortcutAction, readonly string[]>> = {
  next: ["j", "ArrowDown"],
  previous: ["k", "ArrowUp"],
  approve: ["a"],
  reject: ["r"],
  edit: ["e", "Enter"],
  retranslate: ["t"],
  help: ["?"],
};

const SHORTCUT_LABELS: Readonly<Record<ReviewShortcutAction, string>> = {
  next: "Next entry",
  previous: "Previous entry",
  approve: "Approve the entry",
  reject: "Reject the entry",
  edit: "Edit the entry",
  retranslate: "Retranslate the entry",
  help: "Show or hide these shortcuts",
};

export const REVIEW_SHORTCUTS: readonly ReviewShortcut[] = (
  Object.keys(SHORTCUT_KEYS) as ReviewShortcutAction[]
).map((action) => ({
  action,
  keys: SHORTCUT_KEYS[action],
  label: SHORTCUT_LABELS[action],
  needsSpend: action === "retranslate",
}));

export type ShortcutTarget = "editable" | "control" | "other";

export interface ShortcutKeyEvent {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
  readonly target: ShortcutTarget;
}

const ACTION_BY_KEY: ReadonlyMap<string, ReviewShortcutAction> = new Map(
  REVIEW_SHORTCUTS.flatMap((shortcut) => shortcut.keys.map((key) => [key, shortcut.action])),
);

export function resolveReviewShortcut(event: ShortcutKeyEvent): ReviewShortcutAction | null {
  if (event.target === "editable" || event.ctrlKey || event.metaKey || event.altKey) {
    return null;
  }
  if (event.target === "control" && event.key === "Enter") {
    return null;
  }
  return ACTION_BY_KEY.get(event.key) ?? null;
}

export function shortcutKeysFor(action: ReviewShortcutAction): string {
  return SHORTCUT_KEYS[action].join(" ");
}

export function visibleShortcuts(spend: boolean): readonly ReviewShortcut[] {
  return REVIEW_SHORTCUTS.filter((shortcut) => spend || !shortcut.needsSpend);
}

export function clampIndex(index: number, count: number): number {
  if (count <= 0) {
    return 0;
  }
  return Math.min(Math.max(index, 0), count - 1);
}

export function stepIndex(index: number, delta: number, count: number): number {
  return clampIndex(index + delta, count);
}

const EDITABLE_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

const TOGGLE_INPUT_TYPES = new Set(["checkbox", "radio"]);

const CONTROL_TAGS = new Set(["BUTTON", "A", "SUMMARY"]);

export interface ShortcutTargetShape {
  readonly tagName: string;
  readonly type: string;
  readonly isContentEditable: boolean;
}

export function classifyShortcutTarget(target: ShortcutTargetShape | null): ShortcutTarget {
  if (target === null) {
    return "other";
  }
  const tag = target.tagName.toUpperCase();
  if (tag === "INPUT" && TOGGLE_INPUT_TYPES.has(target.type.toLowerCase())) {
    return "control";
  }
  if (EDITABLE_TAGS.has(tag) || target.isContentEditable) {
    return "editable";
  }
  return CONTROL_TAGS.has(tag) ? "control" : "other";
}

export interface KeyCap {
  readonly glyph: string;
  readonly name: string;
}

const NAMED_KEYS: Readonly<Record<string, KeyCap>> = {
  ArrowDown: { glyph: "↓", name: "Down arrow" },
  ArrowUp: { glyph: "↑", name: "Up arrow" },
  Enter: { glyph: "Enter", name: "Enter" },
};

export function keyCap(key: string): KeyCap {
  return NAMED_KEYS[key] ?? { glyph: key, name: key };
}
