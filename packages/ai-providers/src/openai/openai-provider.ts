import { type LlmMechanism, runLlmTranslation } from "../llm/run.js";
import type { ProviderNetwork } from "../network/transport.js";
import type { TranslateRequest, TranslateResult, TranslationProvider } from "../provider.js";
import type { ProviderRetryListener } from "../provider-retry.js";
import { DEFAULT_REQUEST_TIMEOUT_MS, withSdkAttemptTimeout } from "../request-timeout.js";
import { createDefaultClient } from "./client.js";
import { type OpenAiConfig, openAiConfigSchema } from "./config.js";
import { buildOpenAiRequest, type OpenAiRequest } from "./request.js";
import { extractOpenAiResult } from "./response.js";
import type { OpenAiClient, OpenAiCompletion } from "./types.js";

const PROVIDER_ID = "openai";

export interface OpenAiDeps {
  readonly client?: OpenAiClient;
  readonly network?: ProviderNetwork;
  readonly onRetry?: ProviderRetryListener;
}

export function createOpenAiProvider(
  config: OpenAiConfig,
  deps: OpenAiDeps = {},
): TranslationProvider {
  const validConfig = openAiConfigSchema.parse(config);
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

function createMechanism(client: OpenAiClient, config: OpenAiConfig): LlmMechanism {
  const timeoutMs = config.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  return {
    translate: async ({ payloadJson, signal }): Promise<ReturnType<typeof extractOpenAiResult>> => {
      const body = buildOpenAiRequest(config, payloadJson);
      const completion = await callClient(client, body, timeoutMs, signal);
      return extractOpenAiResult(completion);
    },
  };
}

function callClient(
  client: OpenAiClient,
  body: OpenAiRequest,
  timeoutMs: number,
  signal: AbortSignal | undefined,
): Promise<OpenAiCompletion> {
  return withSdkAttemptTimeout(timeoutMs, signal, (options) =>
    client.chat.completions.create(body, options),
  );
}
