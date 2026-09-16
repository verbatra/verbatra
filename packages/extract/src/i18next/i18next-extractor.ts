import type { FileExtraction, SourceExtractor, SourceFile } from "../extractor.js";
import { type CallSiteRules, findCallSites } from "../scan/call-sites.js";

export const I18NEXT_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".mts",
  ".cts",
] as const;

export const I18NEXT_MARKUP_EXTENSIONS = [".tsx", ".jsx", ".js"] as const;

export const I18NEXT_CALLEE_NAMES = ["t", "$t"] as const;

export const I18NEXT_TRANSLATION_ELEMENTS = ["Trans", "Translation"] as const;

type I18nextTranslationElement = (typeof I18NEXT_TRANSLATION_ELEMENTS)[number];

const KEYED_ELEMENTS: ReadonlySet<I18nextTranslationElement> = new Set(["Trans"]);

const RENDER_PROP_ELEMENTS: ReadonlySet<I18nextTranslationElement> = new Set(["Translation"]);

const I18NEXT_RULES: CallSiteRules = {
  calleeNames: new Set(I18NEXT_CALLEE_NAMES),
  defaultValueKeys: new Set(["defaultValue"]),
  namespaceSeparator: ":",
  keySeparator: ".",
  fixedTranslateNames: new Set(["getFixedT"]),
  hookNames: new Set(["useTranslation"]),
  keyPrefixNames: new Set(["keyPrefix"]),
  keyAttributeNames: new Set(["i18nKey"]),
  translationElements: new Set(I18NEXT_TRANSLATION_ELEMENTS),
  keyedElements: KEYED_ELEMENTS,
  hocNames: new Set(["withTranslation"]),
  renderPropElements: RENDER_PROP_ELEMENTS,
  memberTranslateNames: new Set(["t"]),
  translateModules: new Set(["i18next", "react-i18next", "next-i18next"]),
  dependencyHookNames: new Set(["useEffect", "useLayoutEffect", "useMemo", "useCallback"]),
};

export function createI18nextExtractor(): SourceExtractor {
  return {
    framework: "i18next",
    extensions: I18NEXT_EXTENSIONS,
    extract: (file: SourceFile): FileExtraction => findCallSites(file.content, I18NEXT_RULES),
  };
}
