import { resolveOpenAiCompatibleKey } from "../env.js";
import { loadSdkModule, memoizeAsync } from "../lazy-sdk.js";
import { toMutableRequest } from "../llm/mutable.js";
import { openAiStyleTransport, type ProviderNetwork } from "../network/transport.js";
import type { OpenAiRequest } from "../openai/request.js";
import type { OpenAiCallOptions, OpenAiClient, OpenAiCompletion } from "../openai/types.js";
import type { ProviderRetryListener } from "../provider-retry.js";
import type { OpenAiCompatibleConfig } from "./config.js";

export function createDefaultClient(
  config: OpenAiCompatibleConfig,
  network?: ProviderNetwork,
  onRetry?: ProviderRetryListener,
): OpenAiClient {
  const transport = openAiStyleTransport(
    { id: "openai-compatible", baseUrl: config.baseUrl },
    network,
    onRetry,
  );
  const apiKey = resolveOpenAiCompatibleKey(config.apiKeyEnvVar);
  const sdk = memoizeAsync(async () => {
    const { default: OpenAI } = await loadSdkModule("openai", () => import("openai"));
    return new OpenAI({
      apiKey,
      baseURL: config.baseUrl,
      logLevel: "off",
      ...transport.options,
    });
  });
  return {
    chat: {
      completions: {
        create: (body: OpenAiRequest, options?: OpenAiCallOptions): Promise<OpenAiCompletion> =>
          transport.run(
            async () =>
              (await (
                await sdk()
              ).chat.completions.create(
                toMutableRequest(body),
                options,
              )) as unknown as OpenAiCompletion,
          ),
      },
    },
  };
}
