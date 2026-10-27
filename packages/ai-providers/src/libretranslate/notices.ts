import type { ProviderNotice, Tone } from "../provider.js";

export interface TranslateNoticesInput {
  readonly tone?: Tone;
  readonly genericGlossarySupplied: boolean;
}

export const FORMALITY_DOWNGRADED_MESSAGE =
  "Formality was not applied: LibreTranslate has no formality control.";
export const GLOSSARY_IGNORED_MESSAGE =
  "The supplied glossary term map was not applied: LibreTranslate does not support a glossary.";

export function buildTranslateNotices(input: TranslateNoticesInput): ProviderNotice[] {
  const notices: ProviderNotice[] = [];
  if (input.tone === "formal" || input.tone === "informal") {
    notices.push({ code: "FORMALITY_DOWNGRADED", message: FORMALITY_DOWNGRADED_MESSAGE });
  }
  if (input.genericGlossarySupplied) {
    notices.push({ code: "GLOSSARY_IGNORED", message: GLOSSARY_IGNORED_MESSAGE });
  }
  return notices;
}
