import { PACKAGE_VERSION } from "./site";

export type LandingCodeLanguage = "bash" | "ts" | "yaml";

export type LandingCodeSample = {
  readonly language: LandingCodeLanguage;
  readonly filename?: string;
  readonly code: string;
};

export const LANDING_SDK_IMPORTS = ["check", "defineConfig", "loadConfig", "translate"] as const;

export const LANDING_CONFIG_CODE = `import { defineConfig } from "@verbatra/sdk";

export default defineConfig({
  sourceLocale: "en",
  targetLocales: ["de", "fr"],
  format: "i18next-json",
  files: { pattern: "locales/{locale}.json" },
  provider: {
    id: "gemini",
    options: { model: "gemini-2.5-flash", maxOutputTokens: 4096 },
  },
  tone: "informal",
});
`;

const SDK_CODE = `import { check, loadConfig, translate } from "@verbatra/sdk";

const config = await loadConfig();

const summary = await translate({ config });
console.log(\`\${summary.succeeded.length} locales translated\`);

const status = await check({ config });
if (!status.inSync) process.exitCode = 1;
`;

const CLI_CODE = `npm install --save-dev @verbatra/cli
npx @verbatra/cli init --provider gemini --yes
npx @verbatra/cli translate --dry-run
npx @verbatra/cli translate
npx @verbatra/cli check
`;

const ACTION_CODE = `name: i18n
on:
  pull_request:

permissions:
  contents: read

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: verbatra/action@v1
        with:
          version: ${PACKAGE_VERSION}
          command: check
`;

export type LandingShowcaseTab = "cli" | "sdk" | "config" | "action";

export const LANDING_SHOWCASE_TABS: ReadonlyArray<LandingShowcaseTab> = [
  "cli",
  "sdk",
  "config",
  "action",
];

export const LANDING_SHOWCASE_CODE: Readonly<Record<LandingShowcaseTab, LandingCodeSample>> = {
  cli: { language: "bash", code: CLI_CODE },
  sdk: { language: "ts", filename: "translate.ts", code: SDK_CODE },
  config: { language: "ts", filename: "verbatra.config.ts", code: LANDING_CONFIG_CODE },
  action: { language: "yaml", filename: ".github/workflows/i18n.yml", code: ACTION_CODE },
};

export type LandingStepId = "check" | "translate" | "ci";

export const LANDING_STEP_IDS: ReadonlyArray<LandingStepId> = ["check", "translate", "ci"];

export const LANDING_STEP_CODE: Readonly<Record<LandingStepId, LandingCodeSample>> = {
  check: { language: "bash", code: "npx @verbatra/cli check\n" },
  translate: { language: "bash", code: "npx @verbatra/cli translate\n" },
  ci: {
    language: "yaml",
    code: `- uses: verbatra/action@v1
  with:
    version: ${PACKAGE_VERSION}
    command: check
`,
  },
};
