import type { ProviderNotice, Tone } from "../provider.js";
import type { DeepLTranslateOptions } from "./types.js";

export interface TranslateOptionsInput {
  readonly tone?: Tone;
  readonly freeAccount: boolean;
  readonly formalityAvailable: boolean;
  readonly glossaryId?: string;
  readonly genericGlossarySupplied: boolean;
}

const FORMALITY_DOWNGRADED_MESSAGE =
  "Formality was not applied: the configured DeepL key is a free-tier key, which does not support formality.";
const FORMALITY_UNAVAILABLE_MESSAGE =
  "Formality was not applied: DeepL lists no formality control for this target language, so it translated in its default register.";
const GLOSSARY_IGNORED_MESSAGE =
  "The supplied glossary term map was not applied: DeepL uses configured glossary IDs, not term maps.";

export function buildTranslateOptions(input: TranslateOptionsInput): {
  options: DeepLTranslateOptions;
  notices: ProviderNotice[];
} {
  const notices: ProviderNotice[] = [];

  const formality = formalityFor(input, notices);

  if (input.genericGlossarySupplied) {
    notices.push({ code: "GLOSSARY_IGNORED", message: GLOSSARY_IGNORED_MESSAGE });
  }

  const options: DeepLTranslateOptions = {
    ...(formality !== undefined ? { formality } : {}),
    ...(input.glossaryId !== undefined ? { glossary: input.glossaryId } : {}),
  };
  return { options, notices };
}

function formalityFor(input: TranslateOptionsInput, notices: ProviderNotice[]): string | undefined {
  if (input.tone !== "formal" && input.tone !== "informal") {
    return undefined;
  }
  if (input.freeAccount) {
    notices.push({ code: "FORMALITY_DOWNGRADED", message: FORMALITY_DOWNGRADED_MESSAGE });
    return undefined;
  }
  if (!input.formalityAvailable) {
    notices.push({ code: "FORMALITY_DOWNGRADED", message: FORMALITY_UNAVAILABLE_MESSAGE });
  }
  return input.tone === "formal" ? "prefer_more" : "prefer_less";
}
