import { requireAnthropicKey } from "../env.js";
import { loadSdkModule, memoizeAsync } from "../lazy-sdk.js";
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
  const apiKey = requireAnthropicKey();
  const sdk = memoizeAsync(async () => {
    const { default: Anthropic } = await loadSdkModule(
      "@anthropic-ai/sdk",
      () => import("@anthropic-ai/sdk"),
    );
    return new Anthropic({ apiKey, logLevel: "off", ...transport.options });
  });
  return {
    messages: {
      create: (body: BuiltRequest, options?: AnthropicCallOptions): Promise<AnthropicMessage> =>
        transport.run(
          async () =>
            (await (
              await sdk()
            ).messages.create(toMutableRequest(body), options)) as unknown as AnthropicMessage,
        ),
    },
  };
}
