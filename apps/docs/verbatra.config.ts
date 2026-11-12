import { defineConfig } from "@verbatra/cli";

export default defineConfig({
  sourceLocale: "en",
  targetLocales: ["de", "es", "fr"],
  format: "next-intl-json",
  files: {
    pattern: "messages/{locale}.json",
  },
  provider: {
    id: "gemini",
    options: {
      model: "gemini-2.5-flash",
      maxOutputTokens: 32768,
    },
  },
  maxBatchSize: 50,
  glossary: {
    version: 2,
    terms: [
      { source: "Verbatra", target: "Verbatra" },
      { source: "next-intl", target: "next-intl" },
      { source: "i18next", target: "i18next" },
      { source: "vue-i18n", target: "vue-i18n" },
      { source: "ngx-translate", target: "ngx-translate" },
      { source: "CLI", target: "CLI" },
      { source: "SDK", target: "SDK" },
      { source: "Anthropic", target: "Anthropic" },
      { source: "OpenAI", target: "OpenAI" },
      { source: "Gemini", target: "Gemini" },
      { source: "DeepL", target: "DeepL" },
      { source: "ICU", target: "ICU" },
      { source: ".properties", target: ".properties" },
      { source: "Java/Spring", target: "Java/Spring" },
      { source: "MIT", target: "MIT" },
      { source: "coding agent", targets: { de: "Coding-Agent" } },
      { source: "coding agents", targets: { de: "Coding-Agenten" } },
      { source: "string", targets: { de: "String" } },
      { source: "strings", targets: { de: "Strings" } },
    ],
  },
  tone: "informal",
});
