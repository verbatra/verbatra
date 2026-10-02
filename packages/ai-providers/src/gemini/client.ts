import { requireGeminiKey } from "../env.js";
import { loadSdkModule, memoizeAsync } from "../lazy-sdk.js";
import { toMutableRequest } from "../llm/mutable.js";
import { geminiTransport, type ProviderNetwork } from "../network/transport.js";
import type { GeminiRequest } from "./request.js";
import type { GeminiClient, GeminiResponse } from "./types.js";

export function createDefaultClient(network?: ProviderNetwork): GeminiClient {
  const transport = geminiTransport(network);
  const apiKey = requireGeminiKey();
  const ai = memoizeAsync(async () => {
    const { GoogleGenAI } = await loadSdkModule("@google/genai", () => import("@google/genai"));
    return new GoogleGenAI({ apiKey, ...transport.options });
  });
  return {
    models: {
      generateContent: (request: GeminiRequest): Promise<GeminiResponse> =>
        transport.run(
          async () =>
            (await (
              await ai()
            ).models.generateContent(toMutableRequest(request))) as unknown as GeminiResponse,
        ),
    },
  };
}
