import OpenAI from "openai";
import { resolveOpenAiCompatibleKey } from "../env.js";
import { toMutableRequest } from "../llm/mutable.js";
import { openAiStyleTransport, type ProviderNetwork } from "../network/transport.js";
import type { OpenAiRequest } from "../openai/request.js";
import type { OpenAiCallOptions, OpenAiClient, OpenAiCompletion } from "../openai/types.js";
import type { OpenAiCompatibleConfig } from "./config.js";

export function createDefaultClient(
  config: OpenAiCompatibleConfig,
  network?: ProviderNetwork,
): OpenAiClient {
  const sdk = new OpenAI({
    apiKey: resolveOpenAiCompatibleKey(config.apiKeyEnvVar),
    baseURL: config.baseUrl,
    logLevel: "off",
    ...openAiStyleTransport({ id: "openai-compatible", baseUrl: config.baseUrl }, network),
  });
  return {
    chat: {
      completions: {
        create: async (
          body: OpenAiRequest,
          options?: OpenAiCallOptions,
        ): Promise<OpenAiCompletion> =>
          (await sdk.chat.completions.create(
            toMutableRequest(body),
            options,
          )) as unknown as OpenAiCompletion,
      },
    },
  };
}
