export type CommandGroup = {
  readonly key: string;
  readonly commands: ReadonlyArray<string>;
};

export const COMMAND_GROUPS: ReadonlyArray<CommandGroup> = [
  { key: "run", commands: ["translate", "watch"] },
  { key: "verify", commands: ["check", "diff", "doctor"] },
  { key: "author", commands: ["extract", "types", "pseudo"] },
  { key: "handoff", commands: ["export", "import", "tmx"] },
  { key: "open", commands: ["studio", "mcp", "init"] },
];

export const LANDING_COMMANDS: ReadonlyArray<string> = COMMAND_GROUPS.flatMap(
  (group) => group.commands,
);
