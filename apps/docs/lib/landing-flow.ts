import { CHECKOUT_ACTION_REF, VERBATRA_ACTION_REF } from "./action-refs";
import { FORMAT_SAMPLES } from "./format-samples";
import { HERO_TERMINAL_TITLE } from "./hero-terminal";
import { STUDIO_RUN_COMMAND } from "./install-commands";
import type { HighlightLanguage } from "./landing-highlight";
import { PACKAGE_VERSION } from "./site";

export type FlowNodeId = "source" | "cli" | "incremental" | "action" | "check" | "studio" | "mcp";

export type FlowSnippet = {
  readonly language: HighlightLanguage;
  readonly filename?: string;
  readonly code: string;
};

export type FlowNode = {
  readonly id: FlowNodeId;
  readonly docsPath: string;
  readonly snippet: FlowSnippet;
};

export const FLOW_CHECK_EXIT_CODES = { fail: 1, ok: 0, usage: 2 } as const;

export const FLOW_DEMO_NODE = "incremental" satisfies FlowNodeId;

export const FLOW_BODY_VALUES: Partial<Record<FlowNodeId, Record<string, number>>> = {
  check: FLOW_CHECK_EXIT_CODES,
};

const SOURCE_SAMPLE = FORMAT_SAMPLES["next-intl-json"];

export const FLOW_CLI_CODE = `npx @verbatra/cli init --provider gemini --path "messages/{locale}.json" --yes
npx @verbatra/cli translate --dry-run
npx @verbatra/cli translate
`;

export const FLOW_SDK_CODE = `import { loadConfig, translate } from "@verbatra/sdk";

const config = await loadConfig();
const summary = await translate({ config });
`;

export const FLOW_ACTION_CODE = `name: translate
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

export const FLOW_CHECK_CODE = "npx @verbatra/cli check\n";

export const FLOW_MCP_CODE = `{
  "mcpServers": {
    "verbatra": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@verbatra/mcp"]
    }
  }
}
`;

export const FLOW_NODES: ReadonlyArray<FlowNode> = [
  {
    id: "source",
    docsPath: "/docs/formats",
    snippet: { language: "json", filename: SOURCE_SAMPLE.file, code: SOURCE_SAMPLE.text },
  },
  {
    id: "cli",
    docsPath: "/docs/cli/translate",
    snippet: { language: "bash", filename: HERO_TERMINAL_TITLE, code: FLOW_CLI_CODE },
  },
  {
    id: "incremental",
    docsPath: "/docs/sdk-quickstart",
    snippet: { language: "ts", filename: "translate.ts", code: FLOW_SDK_CODE },
  },
  {
    id: "action",
    docsPath: "/docs/github-action",
    snippet: {
      language: "yaml",
      filename: ".github/workflows/translate.yml",
      code: FLOW_ACTION_CODE,
    },
  },
  {
    id: "check",
    docsPath: "/docs/ci-and-exit-codes",
    snippet: { language: "bash", filename: HERO_TERMINAL_TITLE, code: FLOW_CHECK_CODE },
  },
  {
    id: "studio",
    docsPath: "/docs/review-in-studio",
    snippet: { language: "bash", filename: HERO_TERMINAL_TITLE, code: `${STUDIO_RUN_COMMAND}\n` },
  },
  {
    id: "mcp",
    docsPath: "/docs/connect-an-mcp-client",
    snippet: { language: "json", filename: ".mcp.json", code: FLOW_MCP_CODE },
  },
];
