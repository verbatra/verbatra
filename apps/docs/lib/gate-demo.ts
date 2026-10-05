export type GateAnnotation = "new" | "kept";

export type GateLine = {
  readonly text: string;
  readonly annotation?: GateAnnotation;
};

export const GATE_TARGET_LINES: ReadonlyArray<GateLine> = [
  { text: "{" },
  { text: '  "inbox": {' },
  { text: '    "title": "Posteingang",', annotation: "new" },
  { text: '    "count": "{count} neue Nachrichten"', annotation: "kept" },
  { text: "  }" },
  { text: "}" },
];

export const GATE_LOCK_FILE = "verbatra.lock.json";

export const GATE_SOURCE_VALUES = {
  "inbox.title": "Inbox",
  "inbox.count": "{count} new messages",
} as const;

export const GATE_LOCK_HASHES: Readonly<Record<keyof typeof GATE_SOURCE_VALUES, string>> = {
  "inbox.title": "2c98ff5147e47a0c",
  "inbox.count": "9e4869d76e202a7a",
};

export const GATE_LOCK_LINES: ReadonlyArray<string> = [
  '{ "de": {',
  `    "inbox.title": "${GATE_LOCK_HASHES["inbox.title"]}",`,
  `    "inbox.count": "${GATE_LOCK_HASHES["inbox.count"]}"`,
  "} }",
];

export const GATE_MISSING_PLACEHOLDER = "{count}";

export const GATE_REASON = "placeholder";

export const GATE_REFUSAL = {
  key: "inbox.count",
  candidate: '"Neue Nachrichten"',
  missing: GATE_MISSING_PLACEHOLDER,
  reason: GATE_REASON,
  kept: '"{count} neue Nachrichten"',
} as const;

export const GATE_WITHHELD_LABEL = "integrity-withheld";

export const GATE_CLI_COMMAND = "verbatra translate";

export const GATE_CLI_LINE = `de: 1 translated, 0 unchanged, 1 ${GATE_WITHHELD_LABEL}`;

export const GATE_RUN_LINES: ReadonlyArray<string> = [
  `  ${GATE_CLI_LINE}, 149 tokens (131 in, 18 out)`,
  `    ${GATE_WITHHELD_LABEL}:`,
  `      ${GATE_REFUSAL.key}: ${GATE_REASON} (-${GATE_MISSING_PLACEHOLDER})`,
  "  total: 149 tokens (131 in, 18 out)",
  "0 succeeded, 1 partial, 0 failed",
];
