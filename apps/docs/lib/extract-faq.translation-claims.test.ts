import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { extractFaqItems } from "./extract-faq";
import { i18n, type Locale } from "./i18n";

const FAQ_DIR = join(dirname(fileURLToPath(import.meta.url)), "../content/docs/(help)");

function faqFile(locale: Locale): string {
  const suffix = locale === i18n.defaultLanguage ? "" : `.${locale}`;
  return readFileSync(join(FAQ_DIR, `faq${suffix}.mdx`), "utf8");
}

const TRANSLATION_QUESTION: Record<Locale, RegExp> = {
  en: /^Is this site's content translated by AI\?$/,
  de: /^Ist der Inhalt dieser Seite KI-übersetzt\?$/,
  es: /^¿El contenido de este sitio está traducido por IA\?$/,
  fr: /^Le contenu de ce site est-il traduit par IA \?$/,
};

const RETIRED_CLAIMS: Record<Locale, RegExp> = {
  en: /Yes, both halves|automatically whenever the English source changes|reviewed before publication|separate, manual step/,
  de: /Ja, beide Hälften|automatisch immer dann|vor der Veröffentlichung geprüft|eigener, manueller Schritt/,
  es: /Sí, las dos mitades|lo retraduce automáticamente|ejecutado por pnpm i18n cada vez|se revisa antes de publicarse|paso\s+aparte y manual/,
  fr: /Oui, les deux moitiés|retraduit automatiquement|exécuté par pnpm i18n dès que|relu avant sa publication|étape séparée et manuelle/,
};

const SAME_CHANGE_AGENT_TRANSLATION: Record<Locale, RegExp> = {
  en: /an AI agent translates a doc page in the same change\s+that\s+edits its English source/,
  de: /übersetzt ein KI-Agent eine Doku-Seite in derselben Änderung,\s+die ihre englische Quelle bearbeitet/,
  es: /un agente de IA traduce cada página\s+de documentación en el mismo cambio que edita su fuente en inglés/,
  fr: /un agent IA\s+traduit chaque page de documentation dans le même changement/,
};

const BEST_EFFORT_REVIEW: Record<Locale, RegExp> = {
  en: /checked on a best-effort basis, and not every translated text is reviewed by a person/,
  de: /nach bestem Bemühen geprüft, und nicht jeder übersetzte Text wird .* von einem Menschen/,
  es: /se revisan en la medida de lo posible, y no todos los textos traducidos los revisa una persona/,
  fr: /vérifiées dans la mesure du possible, et tous les textes traduits ne sont pas relus par une personne/,
};

describe.each(i18n.languages)("extractFaqItems: site translation answer (%s)", (locale) => {
  const answer =
    extractFaqItems(faqFile(locale)).find((item) =>
      TRANSLATION_QUESTION[locale].test(item.question),
    )?.answer ?? "";

  it("keeps a translation question in the FAQ structured data", () => {
    expect(answer).not.toBe("");
  });

  it("does not repeat the retired automatic-pipeline or full-review claims", () => {
    expect(answer).not.toMatch(RETIRED_CLAIMS[locale]);
  });

  it("says an AI agent translates doc pages in the same change as the English page", () => {
    expect(answer).toMatch(SAME_CHANGE_AGENT_TRANSLATION[locale]);
  });

  it("states the best-effort review and names the pipeline and its drift gate", () => {
    expect(answer).toMatch(BEST_EFFORT_REVIEW[locale]);
    expect(answer).toMatch(/pnpm i18n/);
    expect(answer).toMatch(/docs-i18n-check/);
  });
});
