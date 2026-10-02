import type * as deepl from "deepl-node";
import { requireDeepLKey } from "../env.js";
import { loadSdkModule, memoizeAsync } from "../lazy-sdk.js";
import { silenceSdkLogging } from "./log-suppression.js";
import type { DeepLClientBundle, DeepLTextResult, DeepLTranslateClient } from "./types.js";

export function createDefaultClient(timeoutMs: number): DeepLClientBundle {
  const authKey = requireDeepLKey();
  const freeAccount = authKey.endsWith(":fx");
  const translator = memoizeAsync(async () => {
    await silenceSdkLogging();
    const { Translator } = await loadSdkModule("deepl-node", () => import("deepl-node"));
    return new Translator(authKey, { minTimeout: timeoutMs });
  });
  const client: DeepLTranslateClient = {
    translateText: async (texts, sourceLang, targetLang, options): Promise<DeepLTextResult[]> =>
      (await (
        await translator()
      ).translateText(
        texts as string[],
        sourceLang as deepl.SourceLanguageCode | null,
        targetLang as deepl.TargetLanguageCode,
        options as deepl.TranslateTextOptions,
      )) as unknown as DeepLTextResult[],
  };
  return { client, freeAccount };
}
