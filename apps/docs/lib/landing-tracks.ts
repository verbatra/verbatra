import { CHECKOUT_ACTION_REF, VERBATRA_ACTION_REF } from "./action-refs";
import { FORMAT_SAMPLES } from "./format-samples";
import {
  HERO_CHECK_EXIT_CODE,
  HERO_CHECK_OUTPUT,
  HERO_TRANSLATE_EXIT_CODE,
  HERO_TRANSLATE_OUTPUT,
} from "./hero-terminal";
import type { HighlightLanguage } from "./landing-highlight";
import { PACKAGE_VERSION } from "./site";

export type LandingTrackId = "translate" | "agents" | "ci";

export type LandingTrackFile = {
  readonly language: HighlightLanguage;
  readonly filename: string;
  readonly code: string;
};

export type LandingTrack = {
  readonly id: LandingTrackId;
  readonly docsPath: string;
  readonly commands: ReadonlyArray<string>;
  readonly files: ReadonlyArray<LandingTrackFile>;
  readonly result: ReadonlyArray<string>;
  readonly exitCode: number | null;
};

export const TRACK_CHECK_EXIT_CODES = { fail: 1, ok: 0, usage: 2 } as const;

const SOURCE_SAMPLE = FORMAT_SAMPLES["next-intl-json"];

export const TRACK_TRANSLATE_COMMANDS: ReadonlyArray<string> = [
  'npx @verbatra/cli init --provider gemini --path "messages/{locale}.json" --yes',
  "npx @verbatra/cli translate --dry-run",
  "npx @verbatra/cli translate",
];

export const TRACK_CHECK_COMMAND = "npx @verbatra/cli check";

export const TRACK_ACTION_WORKFLOW = `name: translate
on:
  push:
    branches: [main]

permissions:
  contents: read

jobs:
  verbatra:
    runs-on: ubuntu-latest
    steps:
      - uses: ${CHECKOUT_ACTION_REF}
      - uses: ${VERBATRA_ACTION_REF}
        with:
          version: ${PACKAGE_VERSION}
        env:
          GEMINI_API_KEY: \${{ secrets.GEMINI_API_KEY }}
`;

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
    commands: TRACK_TRANSLATE_COMMANDS,
    files: [{ language: "json", filename: SOURCE_SAMPLE.file, code: SOURCE_SAMPLE.text }],
    result: HERO_TRANSLATE_OUTPUT,
    exitCode: HERO_TRANSLATE_EXIT_CODE,
  },
  agents: {
    id: "agents",
    docsPath: "/docs/connect-an-mcp-client",
    commands: [TRACK_MCP_ADD_COMMAND],
    files: [{ language: "json", filename: ".mcp.json", code: TRACK_MCP_JSON }],
    result: [],
    exitCode: null,
  },
  ci: {
    id: "ci",
    docsPath: "/docs/ci-and-exit-codes",
    commands: [TRACK_CHECK_COMMAND],
    files: [
      {
        language: "yaml",
        filename: ".github/workflows/translate.yml",
        code: TRACK_ACTION_WORKFLOW,
      },
    ],
    result: HERO_CHECK_OUTPUT,
    exitCode: HERO_CHECK_EXIT_CODE,
  },
};
