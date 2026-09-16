import type { LiteralRules } from "../literals/find-literals.js";
import {
  I18NEXT_CALLEE_NAMES,
  I18NEXT_EXTENSIONS,
  I18NEXT_MARKUP_EXTENSIONS,
  I18NEXT_TRANSLATION_ELEMENTS,
} from "./i18next-extractor.js";

const I18NEXT_TRANSLATION_HOOKS = ["useTranslation"] as const;

export function createI18nextLiteralRules(): LiteralRules {
  return {
    extensions: I18NEXT_EXTENSIONS,
    markupExtensions: I18NEXT_MARKUP_EXTENSIONS,
    calleeNames: new Set(I18NEXT_CALLEE_NAMES),
    translationElements: new Set(I18NEXT_TRANSLATION_ELEMENTS),
    translationHooks: new Set(I18NEXT_TRANSLATION_HOOKS),
  };
}
