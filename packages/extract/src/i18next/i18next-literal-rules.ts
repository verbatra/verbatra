import type { LiteralRules } from "../literals/find-literals.js";
import { I18NEXT_CALLEE_NAMES, I18NEXT_EXTENSIONS } from "./i18next-extractor.js";

const I18NEXT_MARKUP_EXTENSIONS = [".tsx", ".jsx", ".js"] as const;

const I18NEXT_TRANSLATION_ELEMENTS = ["Trans", "Translation"] as const;

export function createI18nextLiteralRules(): LiteralRules {
  return {
    extensions: I18NEXT_EXTENSIONS,
    markupExtensions: I18NEXT_MARKUP_EXTENSIONS,
    calleeNames: new Set(I18NEXT_CALLEE_NAMES),
    translationElements: new Set(I18NEXT_TRANSLATION_ELEMENTS),
  };
}
