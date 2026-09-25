import * as deepl from "deepl-node";
import { requireDeepLKey } from "../env.js";
import { silenceSdkLogging } from "./log-suppression.js";
import type { DeepLClientBundle, DeepLTextResult, DeepLTranslateClient } from "./types.js";

export function createDefaultClient(timeoutMs: number): DeepLClientBundle {
  silenceSdkLogging();
  const authKey = requireDeepLKey();
  const freeAccount = authKey.endsWith(":fx");
  const translator = new deepl.Translator(authKey, { minTimeout: timeoutMs });
  const client: DeepLTranslateClient = {
    translateText: async (texts, sourceLang, targetLang, options): Promise<DeepLTextResult[]> =>
      (await translator.translateText(
        texts as string[],
        sourceLang as deepl.SourceLanguageCode | null,
        targetLang as deepl.TargetLanguageCode,
        options as deepl.TranslateTextOptions,
      )) as unknown as DeepLTextResult[],
  };
  return { client, freeAccount };
}
