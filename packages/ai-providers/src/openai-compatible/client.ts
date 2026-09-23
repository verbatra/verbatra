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
  const transport = openAiStyleTransport(
    { id: "openai-compatible", baseUrl: config.baseUrl },
    network,
  );
  const sdk = new OpenAI({
    apiKey: resolveOpenAiCompatibleKey(config.apiKeyEnvVar),
    baseURL: config.baseUrl,
    logLevel: "off",
    ...transport.options,
  });
  return {
    chat: {
      completions: {
        create: (body: OpenAiRequest, options?: OpenAiCallOptions): Promise<OpenAiCompletion> =>
          transport.run(
            async () =>
              (await sdk.chat.completions.create(
                toMutableRequest(body),
                options,
              )) as unknown as OpenAiCompletion,
          ),
      },
    },
  };
}
