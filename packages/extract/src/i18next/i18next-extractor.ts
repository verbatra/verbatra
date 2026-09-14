import type { FileExtraction, SourceExtractor, SourceFile } from "../extractor.js";
import { type CallSiteRules, findCallSites } from "../scan/call-sites.js";

const I18NEXT_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts"] as const;

const I18NEXT_RULES: CallSiteRules = {
  calleeNames: new Set(["t", "$t"]),
  defaultValueKeys: new Set(["defaultValue"]),
};

export function createI18nextExtractor(): SourceExtractor {
  return {
    framework: "i18next",
    extensions: I18NEXT_EXTENSIONS,
    extract: (file: SourceFile): FileExtraction => findCallSites(file.content, I18NEXT_RULES),
  };
}
