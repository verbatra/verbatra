import {
  HERO_CHECK_COMMAND,
  HERO_CHECK_EXIT_CODE,
  HERO_CHECK_OUTPUT,
  HERO_TERMINAL_TITLE,
  HERO_TRANSLATE_COMMAND,
  HERO_TRANSLATE_EXIT_CODE,
  HERO_TRANSLATE_OUTPUT,
} from "./hero-terminal";
import type { HighlightLanguage } from "./landing-highlight";

export type LandingTrackId = "translate" | "agents" | "ci";

export type LandingTrackFile = {
  readonly language: HighlightLanguage;
  readonly filename: string;
  readonly code: string;
};

export type LandingTrack = {
  readonly id: LandingTrackId;
  readonly docsPath: string;
  readonly terminalTitle: string;
  readonly commands: ReadonlyArray<string>;
  readonly files: ReadonlyArray<LandingTrackFile>;
  readonly result: ReadonlyArray<string>;
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
    commands: [HERO_TRANSLATE_COMMAND],
    files: [],
    result: HERO_TRANSLATE_OUTPUT,
    exitCode: HERO_TRANSLATE_EXIT_CODE,
  },
  agents: {
    id: "agents",
    docsPath: "/docs/connect-an-mcp-client",
    terminalTitle: HERO_TERMINAL_TITLE,
    commands: [TRACK_MCP_ADD_COMMAND],
    files: [{ language: "json", filename: ".mcp.json", code: TRACK_MCP_JSON }],
    result: [],
    exitCode: null,
  },
  ci: {
    id: "ci",
    docsPath: "/docs/ci-and-exit-codes",
    terminalTitle: HERO_TERMINAL_TITLE,
    commands: [HERO_CHECK_COMMAND],
    files: [],
    result: HERO_CHECK_OUTPUT,
    exitCode: HERO_CHECK_EXIT_CODE,
  },
};
