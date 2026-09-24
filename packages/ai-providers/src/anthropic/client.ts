import Anthropic from "@anthropic-ai/sdk";
import { requireAnthropicKey } from "../env.js";
import { toMutableRequest } from "../llm/mutable.js";
import { openAiStyleTransport, type ProviderNetwork } from "../network/transport.js";
import type { ProviderRetryListener } from "../provider-retry.js";
import type { BuiltRequest } from "./request.js";
import type { AnthropicCallOptions, AnthropicMessage, MessagesClient } from "./types.js";

export function createDefaultClient(
  network?: ProviderNetwork,
  onRetry?: ProviderRetryListener,
): MessagesClient {
  const transport = openAiStyleTransport({ id: "anthropic" }, network, onRetry);
  const sdk = new Anthropic({
    apiKey: requireAnthropicKey(),
    logLevel: "off",
    ...transport.options,
  });
  return {
    messages: {
      create: (body: BuiltRequest, options?: AnthropicCallOptions): Promise<AnthropicMessage> =>
        transport.run(
          async () =>
            (await sdk.messages.create(
              toMutableRequest(body),
              options,
            )) as unknown as AnthropicMessage,
        ),
    },
  };
}
