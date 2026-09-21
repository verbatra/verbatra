export type GateAnnotation = "new" | "kept";

export type GateLine = {
  readonly text: string;
  readonly annotation?: GateAnnotation;
};

export const GATE_SOURCE_FILE = "en.json";
export const GATE_TARGET_FILE = "de.json";

export const GATE_SOURCE_LINES: ReadonlyArray<GateLine> = [
  { text: "{" },
  { text: '  "inbox": {' },
  { text: '    "title": "Inbox",' },
  { text: '    "unread": "{count} unread messages"' },
  { text: "  }" },
  { text: "}" },
];

export const GATE_TARGET_LINES: ReadonlyArray<GateLine> = [
  { text: "{" },
  { text: '  "inbox": {' },
  { text: '    "title": "Posteingang",', annotation: "new" },
  { text: '    "unread": "{count} ungelesene Nachrichten"', annotation: "kept" },
  { text: "  }" },
  { text: "}" },
];

export const GATE_MISSING_PLACEHOLDER = "{count}";

export const GATE_REASON = "placeholder";

export const GATE_REFUSAL = {
  key: "inbox.unread",
  candidate: '"Ungelesene Nachrichten"',
  missing: GATE_MISSING_PLACEHOLDER,
  reason: GATE_REASON,
  kept: '"{count} ungelesene Nachrichten"',
} as const;

export const GATE_WITHHELD_LABEL = "integrity-withheld";

export const GATE_CLI_COMMAND = "verbatra translate";

export const GATE_CLI_LINE = `de: 1 translated, 0 unchanged, 1 ${GATE_WITHHELD_LABEL}`;
