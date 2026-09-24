import sdk = require("@verbatra/sdk");

export const config = sdk.defineConfig({
  sourceLocale: "en",
  targetLocales: ["de"],
  format: "i18next-json",
  files: { pattern: "locales/{locale}.json" },
  provider: { id: "deepl", options: {} },
});

export const isSdkError = (error: unknown): boolean => error instanceof sdk.SdkError;

export function providerErrorCode(error: unknown): sdk.ProviderErrorCode | undefined {
  return error instanceof sdk.ProviderError ? error.code : undefined;
}
