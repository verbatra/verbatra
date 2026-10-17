import { requireOpenAiKey } from "../env.js";
import { loadSdkModule, memoizeAsync } from "../lazy-sdk.js";
import { toMutableRequest } from "../llm/mutable.js";
import { openAiStyleTransport, type ProviderNetwork } from "../network/transport.js";
import type { ProviderRetryListener } from "../provider-retry.js";
import type { OpenAiRequest } from "./request.js";
import type { OpenAiCallOptions, OpenAiClient, OpenAiCompletion } from "./types.js";

export function createDefaultClient(
  network?: ProviderNetwork,
  onRetry?: ProviderRetryListener,
): OpenAiClient {
  const transport = openAiStyleTransport({ id: "openai" }, network, onRetry);
  const apiKey = requireOpenAiKey();
  const loadClient = memoizeAsync(async () => {
    const { default: OpenAI } = await loadSdkModule("openai", () => import("openai"));
    return new OpenAI({ apiKey, logLevel: "off", ...transport.options });
  });
  return {
    chat: {
      completions: {
        create: (body: OpenAiRequest, options?: OpenAiCallOptions): Promise<OpenAiCompletion> =>
          transport.run(
            async () =>
              (await (
                await loadClient()
              ).chat.completions.create(
                toMutableRequest(body),
                options,
              )) as unknown as OpenAiCompletion,
          ),
      },
    },
  };
}
