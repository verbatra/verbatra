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
  "zh-CN": /^本站内容是由 AI 翻译的吗？$/,
  "pt-BR": /^O conteúdo deste site é traduzido por IA\?$/,
  ja: /^このサイトのコンテンツは AI で翻訳されていますか？$/,
};

const RETIRED_CLAIMS: Record<Locale, RegExp> = {
  en: /Yes, both halves|automatically whenever the English source changes|reviewed before publication|separate, manual step/,
  de: /Ja, beide Hälften|automatisch immer dann|vor der Veröffentlichung geprüft|eigener, manueller Schritt/,
  es: /Sí, las dos mitades|lo retraduce automáticamente|ejecutado por pnpm i18n cada vez|se revisa antes de publicarse|paso\s+aparte y manual/,
  fr: /Oui, les deux moitiés|retraduit automatiquement|exécuté par pnpm i18n dès que|relu avant sa publication|étape séparée et manuelle/,
  "zh-CN": /是的，两部分都|源文件一更改就自动|发布前都经过审校|单独的手动步骤/,
  "pt-BR":
    /Sim, as duas metades|retraduz automaticamente|executado pelo pnpm i18n sempre que|revisado antes da publicação|etapa separada e manual/,
  ja: /はい、両方とも|英語のソースが変わるたびに自動で|公開前にレビュー|別の手動の手順/,
};

const SAME_CHANGE_AGENT_TRANSLATION: Record<Locale, RegExp> = {
  en: /an AI agent translates a doc page in the same change\s+that\s+edits its English source/,
  de: /übersetzt ein KI-Agent eine Doku-Seite in derselben Änderung,\s+die ihre englische Quelle bearbeitet/,
  es: /un agente de IA traduce cada página\s+de documentación en el mismo cambio que edita su fuente en inglés/,
  fr: /un agent IA\s+traduit chaque page de documentation dans le même changement/,
  "zh-CN": /AI 智能体会在编辑英文源文件的同一次变更中翻译对应的文档页面/,
  "pt-BR":
    /um agente de IA traduz cada página\s+da documentação na mesma alteração\s+que edita a origem em inglês/,
  ja: /AI エージェントが、英語のソースを編集するのと同じ変更でドキュメントページを翻訳します/,
};

const BEST_EFFORT_REVIEW: Record<Locale, RegExp> = {
  en: /checked on a best-effort basis, and not every translated text is reviewed by a person/,
  de: /nach bestem Bemühen geprüft, und nicht jeder übersetzte Text wird .* von einem Menschen/,
  es: /se revisan en la medida de lo posible, y no todos los textos traducidos los revisa una persona/,
  fr: /vérifiées dans la mesure du possible, et tous les textes traduits ne sont pas relus par une personne/,
  "zh-CN": /译文会尽力检查，但并非每段译文都经过人工审校/,
  "pt-BR":
    /verificadas na medida do possível, e nem todo texto traduzido é revisado por uma pessoa/,
  ja: /訳文はできる範囲で確認していますが、すべての訳文を人がレビューしているわけではありません/,
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
