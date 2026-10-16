import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createTranslator } from "next-intl";

const MESSAGES_DIR = join(import.meta.dirname, "../messages");

export function catalogMessages(locale: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(MESSAGES_DIR, `${locale}.json`), "utf8"));
}

export const catalogIntlServer = {
  setRequestLocale: (): undefined => undefined,
  getTranslations: async ({ locale, namespace }: { locale: string; namespace: string }) =>
    createTranslator({ locale, messages: catalogMessages(locale), namespace: namespace as never }),
};
