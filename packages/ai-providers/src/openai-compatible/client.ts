import { resolveOpenAiCompatibleKey } from "../env.js";
import { loadSdkModule, memoizeAsync } from "../lazy-sdk.js";
import { toMutableRequest } from "../llm/mutable.js";
import { openAiStyleTransport, type ProviderNetwork } from "../network/transport.js";
import type { OpenAiRequest } from "../openai/request.js";
import type { OpenAiCallOptions, OpenAiClient, OpenAiCompletion } from "../openai/types.js";
import type { ProviderRetryListener } from "../provider-retry.js";
import type { OpenAiCompatibleConfig } from "./config.js";

export const OPENAI_COMPATIBLE_USER_AGENT = "verbatra";

export interface HostedClientIdentity {
  readonly id: "opencode";
  readonly apiKey: string;
}

export function createDefaultClient(
  config: OpenAiCompatibleConfig,
  network?: ProviderNetwork,
  onRetry?: ProviderRetryListener,
  hosted?: HostedClientIdentity,
): OpenAiClient {
  const transport = openAiStyleTransport(
    hosted === undefined ? { id: "openai-compatible", baseUrl: config.baseUrl } : { id: hosted.id },
    network,
    onRetry,
  );
  const apiKey = hosted?.apiKey ?? resolveOpenAiCompatibleKey(config.apiKeyEnvVar);
  const loadClient = memoizeAsync(async () => {
    const { default: OpenAI } = await loadSdkModule("openai", () => import("openai"));
    return new OpenAI({
      apiKey,
      baseURL: config.baseUrl,
      logLevel: "off",
      defaultHeaders: { "User-Agent": OPENAI_COMPATIBLE_USER_AGENT },
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
