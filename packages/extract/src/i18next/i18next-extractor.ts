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

export const I18NEXT_CALLEE_NAMES = ["t", "$t"] as const;

const I18NEXT_RULES: CallSiteRules = {
  calleeNames: new Set(I18NEXT_CALLEE_NAMES),
  defaultValueKeys: new Set(["defaultValue"]),
  namespaceSeparator: ":",
  keySeparator: ".",
};

export function createI18nextExtractor(): SourceExtractor {
  return {
    framework: "i18next",
    extensions: I18NEXT_EXTENSIONS,
    extract: (file: SourceFile): FileExtraction => findCallSites(file.content, I18NEXT_RULES),
  };
}
