import { GoogleGenAI } from "@google/genai";
import { requireGeminiKey } from "../env.js";
import { toMutableRequest } from "../llm/mutable.js";
import { geminiTransport, type ProviderNetwork } from "../network/transport.js";
import type { GeminiRequest } from "./request.js";
import { withGeminiRetry } from "./retry.js";
import type { GeminiClient, GeminiResponse } from "./types.js";

export function createDefaultClient(network?: ProviderNetwork): GeminiClient {
  const transport = geminiTransport(network);
  const ai = new GoogleGenAI({ apiKey: requireGeminiKey(), ...transport.options });
  return {
    models: {
      generateContent: (request: GeminiRequest): Promise<GeminiResponse> =>
        withGeminiRetry(
          () =>
            transport.run(
              async () =>
                (await ai.models.generateContent(
                  toMutableRequest(request),
                )) as unknown as GeminiResponse,
            ),
          request.config.abortSignal,
        ),
    },
  };
}
