import { endpointContextOf } from "../base-url.js";
import { requireOpenCodeKey } from "../env.js";
import { runLlmTranslation } from "../llm/run.js";
import { OPENCODE_BASE_URL } from "../network/endpoints.js";
import type { ProviderNetwork } from "../network/transport.js";
import type { OpenAiClient } from "../openai/types.js";
import { createDefaultClient } from "../openai-compatible/client.js";
import { createOpenAiCompatibleMechanism } from "../openai-compatible/openai-compatible-provider.js";
import type { TranslateRequest, TranslateResult, TranslationProvider } from "../provider.js";
import type { ProviderRetryListener } from "../provider-retry.js";
import { type OpenCodeConfig, openCodeConfigSchema } from "./config.js";

const PROVIDER_ID = "opencode";

export interface OpenCodeDeps {
  readonly client?: OpenAiClient;
  readonly network?: ProviderNetwork;
  readonly onRetry?: ProviderRetryListener;
}

export function createOpenCodeProvider(
  config: OpenCodeConfig,
  deps: OpenCodeDeps = {},
): TranslationProvider {
  const validConfig = { ...openCodeConfigSchema.parse(config), baseUrl: OPENCODE_BASE_URL };
  const client =
    deps.client ??
    createDefaultClient(validConfig, deps.network, deps.onRetry, {
      id: PROVIDER_ID,
      apiKey: requireOpenCodeKey(),
    });
  const mechanism = createOpenAiCompatibleMechanism(client, validConfig, {
    ...endpointContextOf(OPENCODE_BASE_URL),
    remedies: "zen-chat-completions",
  });
  return {
    id: PROVIDER_ID,
    kind: "llm",
    supportsGlossary: true,
    translateBatch: (request: TranslateRequest): Promise<TranslateResult> =>
      runLlmTranslation(request, mechanism, validConfig.localeMap),
  };
}
