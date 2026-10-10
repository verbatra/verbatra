export const GATE_SOURCE_VALUES = {
  "inbox.title": "Inbox",
  "inbox.count": "{count} new messages",
} as const;

export const GATE_REPLIES: Readonly<Record<keyof typeof GATE_SOURCE_VALUES, string>> = {
  "inbox.title": "Posteingang",
  "inbox.count": "Neue Nachrichten",
};

export const GATE_LOCK_HASHES: Readonly<Partial<Record<keyof typeof GATE_SOURCE_VALUES, string>>> =
  {
    "inbox.title": "2c98ff5147e47a0c",
  };

export const GATE_MISSING_PLACEHOLDER = "{count}";

export const GATE_REASON = "placeholder";

export const GATE_REFUSAL = {
  key: "inbox.count",
  missing: GATE_MISSING_PLACEHOLDER,
  reason: GATE_REASON,
} as const;

export const GATE_WITHHELD_LABEL = "integrity-withheld";

export const GATE_CLI_COMMAND = "verbatra translate";

export const GATE_CLI_LINE = `de: 1 translated, 0 unchanged, 1 ${GATE_WITHHELD_LABEL}`;

export const GATE_REFUSAL_LINE = `      ${GATE_REFUSAL.key}: ${GATE_REASON} (-${GATE_MISSING_PLACEHOLDER})`;

export const GATE_SUMMARY_LINE = "0 succeeded, 1 partial, 0 failed";

export const GATE_RUN_LINES: ReadonlyArray<string> = [
  GATE_CLI_COMMAND,
  `  ${GATE_CLI_LINE}`,
  `    ${GATE_WITHHELD_LABEL}:`,
  GATE_REFUSAL_LINE,
  GATE_SUMMARY_LINE,
];
