import Anthropic from "@anthropic-ai/sdk";
import { requireAnthropicKey } from "../env.js";
import { toMutableRequest } from "../llm/mutable.js";
import { openAiStyleTransport, type ProviderNetwork } from "../network/transport.js";
import type { BuiltRequest } from "./request.js";
import type { AnthropicCallOptions, AnthropicMessage, MessagesClient } from "./types.js";

export function createDefaultClient(network?: ProviderNetwork): MessagesClient {
  const sdk = new Anthropic({
    apiKey: requireAnthropicKey(),
    logLevel: "off",
    ...openAiStyleTransport({ id: "anthropic" }, network),
  });
  return {
    messages: {
      create: async (
        body: BuiltRequest,
        options?: AnthropicCallOptions,
      ): Promise<AnthropicMessage> =>
        (await sdk.messages.create(toMutableRequest(body), options)) as unknown as AnthropicMessage,
    },
  };
}
