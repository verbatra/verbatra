import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createTranslator } from "next-intl";
import { i18n } from "@/lib/i18n";

const MESSAGES_DIR = join(import.meta.dirname, "../messages");

type TranslationScope = string | { locale?: string; namespace?: string };

export function catalogMessages(locale: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(MESSAGES_DIR, `${locale}.json`), "utf8"));
}

export function catalogTranslator(locale: string, namespace?: string) {
  return createTranslator({
    locale,
    messages: catalogMessages(locale),
    namespace: namespace as never,
  });
}

export function catalogIntlServerAt(currentLocale: () => string) {
  return {
    setRequestLocale: (): undefined => undefined,
    getLocale: async (): Promise<string> => currentLocale(),
    getTranslations: async (scope?: TranslationScope) =>
      typeof scope === "object"
        ? catalogTranslator(scope.locale ?? currentLocale(), scope.namespace)
        : catalogTranslator(currentLocale(), scope),
  };
}

export const catalogIntlServer = catalogIntlServerAt(() => i18n.defaultLanguage);
