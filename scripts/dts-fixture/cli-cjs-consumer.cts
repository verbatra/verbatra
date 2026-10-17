import cli = require("@verbatra/cli");

export const config = cli.defineConfig({
  sourceLocale: "en",
  targetLocales: ["de"],
  format: "i18next-json",
  files: { pattern: "locales/{locale}.json" },
  provider: { id: "deepl", options: {} },
});

export const firstCliErrorCode: cli.CliErrorCode = cli.CLI_ERROR_CODES[0];
