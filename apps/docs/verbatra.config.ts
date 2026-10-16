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
    Verbatra: "Verbatra",
    "next-intl": "next-intl",
    i18next: "i18next",
    "vue-i18n": "vue-i18n",
    "ngx-translate": "ngx-translate",
    CLI: "CLI",
    SDK: "SDK",
    Anthropic: "Anthropic",
    OpenAI: "OpenAI",
    Gemini: "Gemini",
    DeepL: "DeepL",
    ICU: "ICU",
    ".properties": ".properties",
    "Java/Spring": "Java/Spring",
    MIT: "MIT",
  },
  tone: "informal",
});
