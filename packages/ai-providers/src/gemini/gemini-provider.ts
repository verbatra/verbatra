import { guardProviderCall } from "../guard.js";
import { type LlmCompletion, type LlmMechanism, runLlmTranslation } from "../llm/run.js";
import type { ProviderNetwork } from "../network/transport.js";
import type { TranslateRequest, TranslateResult, TranslationProvider } from "../provider.js";
import type { ProviderRetryListener } from "../provider-retry.js";
import { DEFAULT_REQUEST_TIMEOUT_MS, raceAttemptTimeout } from "../request-timeout.js";
import { createDefaultClient } from "./client.js";
import { type GeminiConfig, geminiConfigSchema } from "./config.js";
import { buildGeminiRequest } from "./request.js";
import { extractGeminiResult } from "./response.js";
import { DEFAULT_GEMINI_RETRY, type GeminiRetryConfig, withGeminiRetry } from "./retry.js";
import type { GeminiClient } from "./types.js";

const PROVIDER_ID = "gemini";

export interface GeminiDeps {
  readonly client?: GeminiClient;
  readonly network?: ProviderNetwork;
  readonly onRetry?: ProviderRetryListener;
  readonly retry?: GeminiRetryConfig;
}

export function createGeminiProvider(
  config: GeminiConfig,
  deps: GeminiDeps = {},
): TranslationProvider {
  const validConfig = geminiConfigSchema.parse(config);
  const client = deps.client ?? createDefaultClient(deps.network);
  const mechanism = createMechanism(client, validConfig, deps);
  return {
    id: PROVIDER_ID,
    kind: "llm",
    supportsGlossary: true,
    translateBatch: (request: TranslateRequest): Promise<TranslateResult> =>
      runLlmTranslation(request, mechanism, validConfig.localeMap),
  };
}

function createMechanism(
  client: GeminiClient,
  config: GeminiConfig,
  deps: GeminiDeps,
): LlmMechanism {
  const timeoutMs = config.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  const attempt = (payloadJson: string, signal: AbortSignal | undefined) =>
    raceAttemptTimeout(timeoutMs, signal, (attemptSignal) =>
      client.models.generateContent(buildGeminiRequest(config, payloadJson, attemptSignal)),
    );
  return {
    translate: async ({ payloadJson, signal }): Promise<LlmCompletion> => {
      const response = await guardProviderCall(
        () =>
          withGeminiRetry(
            () => attempt(payloadJson, signal),
            signal,
            deps.retry ?? DEFAULT_GEMINI_RETRY,
            deps.onRetry,
          ),
        signal,
      );
      return extractGeminiResult(response);
    },
  };
}
