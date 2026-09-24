import { type LlmCompletion, type LlmMechanism, runLlmTranslation } from "../llm/run.js";
import type { ProviderNetwork } from "../network/transport.js";
import type { TranslateRequest, TranslateResult, TranslationProvider } from "../provider.js";
import type { ProviderRetryListener } from "../provider-retry.js";
import { DEFAULT_REQUEST_TIMEOUT_MS, withRequestTimeout } from "../request-timeout.js";
import { createDefaultClient } from "./client.js";
import { type GeminiConfig, geminiConfigSchema } from "./config.js";
import { buildGeminiRequest } from "./request.js";
import { extractGeminiResult } from "./response.js";
import type { GeminiClient } from "./types.js";

const PROVIDER_ID = "gemini";

export interface GeminiDeps {
  readonly client?: GeminiClient;
  readonly network?: ProviderNetwork;
  readonly onRetry?: ProviderRetryListener;
}

export function createGeminiProvider(
  config: GeminiConfig,
  deps: GeminiDeps = {},
): TranslationProvider {
  const validConfig = geminiConfigSchema.parse(config);
  const client = deps.client ?? createDefaultClient(deps.network, deps.onRetry);
  const mechanism = createMechanism(client, validConfig);
  return {
    id: PROVIDER_ID,
    kind: "llm",
    supportsGlossary: true,
    translateBatch: (request: TranslateRequest): Promise<TranslateResult> =>
      runLlmTranslation(request, mechanism, validConfig.localeMap),
  };
}

function createMechanism(client: GeminiClient, config: GeminiConfig): LlmMechanism {
  const timeoutMs = config.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  return {
    translate: async ({ payloadJson, signal }): Promise<LlmCompletion> => {
      const response = await withRequestTimeout(timeoutMs, signal, (requestSignal) =>
        client.models.generateContent(buildGeminiRequest(config, payloadJson, requestSignal)),
      );
      return extractGeminiResult(response);
    },
  };
}
