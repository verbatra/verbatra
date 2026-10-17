import {
  HERO_CHECK_COMMAND,
  HERO_CHECK_EXIT_CODE,
  HERO_CHECK_OUTPUT,
  HERO_TERMINAL_SCRIPT,
  HERO_TERMINAL_TITLE,
  HERO_TRANSLATE_EXIT_CODE,
} from "./hero-terminal";
import type { HighlightLanguage } from "./landing-highlight";

export type LandingTrackId = "translate" | "agents" | "ci";

export type LandingTrackFile = {
  readonly language: HighlightLanguage;
  readonly filename: string;
  readonly code: string;
};

export type LandingTrackStep = {
  readonly command: string;
  readonly output: ReadonlyArray<string>;
};

export type LandingTrack = {
  readonly id: LandingTrackId;
  readonly docsPath: string;
  readonly terminalTitle: string;
  readonly steps: ReadonlyArray<LandingTrackStep>;
  readonly files: ReadonlyArray<LandingTrackFile>;
  readonly exitCode: number | null;
};

export const TRACK_CHECK_EXIT_CODES = { fail: 1, ok: 0, usage: 2 } as const;

export const TRACK_MCP_JSON = `{
  "mcpServers": {
    "verbatra": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@verbatra/mcp"]
    }
  }
}
`;

export const TRACK_MCP_ADD_COMMAND =
  "claude mcp add --transport stdio --scope project verbatra -- npx -y @verbatra/mcp";

export const LANDING_TRACK_IDS: ReadonlyArray<LandingTrackId> = ["translate", "agents", "ci"];

export const LANDING_TRACKS: Readonly<Record<LandingTrackId, LandingTrack>> = {
  translate: {
    id: "translate",
    docsPath: "/docs/cli/translate",
    terminalTitle: HERO_TERMINAL_TITLE,
    steps: HERO_TERMINAL_SCRIPT.map(({ command, output }) => ({ command, output })),
    files: [],
    exitCode: HERO_TRANSLATE_EXIT_CODE,
  },
  agents: {
    id: "agents",
    docsPath: "/docs/connect-an-mcp-client",
    terminalTitle: HERO_TERMINAL_TITLE,
    steps: [{ command: TRACK_MCP_ADD_COMMAND, output: [] }],
    files: [{ language: "json", filename: ".mcp.json", code: TRACK_MCP_JSON }],
    exitCode: null,
  },
  ci: {
    id: "ci",
    docsPath: "/docs/ci-and-exit-codes",
    terminalTitle: HERO_TERMINAL_TITLE,
    steps: [{ command: HERO_CHECK_COMMAND, output: HERO_CHECK_OUTPUT }],
    files: [],
    exitCode: HERO_CHECK_EXIT_CODE,
  },
};
