export const GATE_SOURCE_VALUES = {
  "inbox.title": "Inbox",
  "inbox.count": "{count} new messages",
} as const;

export const GATE_REPLIES: Readonly<Record<keyof typeof GATE_SOURCE_VALUES, string>> = {
  "inbox.title": "Posteingang",
  "inbox.count": "Neue Nachrichten",
};

export const GATE_MISSING_PLACEHOLDER = "{count}";

export const GATE_REASON = "placeholder";

export const GATE_REFUSAL = {
  key: "inbox.count",
  missing: GATE_MISSING_PLACEHOLDER,
  reason: GATE_REASON,
} as const;
