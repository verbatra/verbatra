import { defineConfig } from "@verbatra/cli";
import { TRANSLATED_LOCALES } from "./lib/locales.ts";

export default defineConfig({
  sourceLocale: "en",
  targetLocales: [...TRANSLATED_LOCALES],
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
      {
        source: "coding agent",
        targets: { de: "Coding-Agent", fr: "agent de code", "zh-CN": "编码智能体" },
      },
      {
        source: "coding agents",
        targets: { de: "Coding-Agenten", fr: "agents de code", "zh-CN": "编码智能体" },
      },
      { source: "string", targets: { de: "String", "zh-CN": "字符串" } },
      { source: "strings", targets: { de: "Strings", "zh-CN": "字符串" } },
      { source: "locale", targets: { es: "locale", fr: "locale", "zh-CN": "语言环境" } },
      { source: "locales", targets: { es: "locales", fr: "locales", "zh-CN": "语言环境" } },
      {
        source: "placeholder",
        targets: { es: "placeholder", fr: "placeholder", "zh-CN": "占位符" },
      },
      {
        source: "placeholders",
        targets: { es: "placeholders", fr: "placeholders", "zh-CN": "占位符" },
      },
      {
        source: "dry run",
        targets: { es: "ejecución de prueba", fr: "exécution à blanc", "zh-CN": "试运行" },
      },
      {
        source: "pull request",
        targets: { es: "pull request", fr: "pull request", "zh-CN": "pull request" },
      },
      {
        source: "pull requests",
        targets: { es: "pull requests", fr: "pull requests", "zh-CN": "pull request" },
      },
      { source: "review queue", targets: { fr: "file de relecture", "zh-CN": "审校队列" } },
    ],
  },
  tone: "informal",
});
