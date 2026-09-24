import { type LlmCompletion, type LlmMechanism, runLlmTranslation } from "../llm/run.js";
import { assertNotTruncated } from "../llm/truncation.js";
import { toUsage as toUsageFromCounts } from "../llm/usage.js";
import type { ProviderNetwork } from "../network/transport.js";
import type { TranslateRequest, TranslateResult, TranslationProvider, Usage } from "../provider.js";
import type { ProviderRetryListener } from "../provider-retry.js";
import { DEFAULT_REQUEST_TIMEOUT_MS, withRequestTimeout } from "../request-timeout.js";
import { createDefaultClient } from "./client.js";
import { type AnthropicConfig, anthropicConfigSchema } from "./config.js";
import { type BuiltRequest, buildRequest } from "./request.js";
import { requireToolInput } from "./response.js";
import type { AnthropicMessage, MessagesClient } from "./types.js";

const PROVIDER_ID = "anthropic";

export interface AnthropicDeps {
  readonly client?: MessagesClient;
  readonly network?: ProviderNetwork;
  readonly onRetry?: ProviderRetryListener;
}

export function createAnthropicProvider(
  config: AnthropicConfig,
  deps: AnthropicDeps = {},
): TranslationProvider {
  const validConfig = anthropicConfigSchema.parse(config);
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

function createMechanism(client: MessagesClient, config: AnthropicConfig): LlmMechanism {
  const timeoutMs = config.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  return {
    translate: async ({ payloadJson, signal }): Promise<LlmCompletion> => {
      const body = buildRequest(config, payloadJson);
      const message = await callClient(client, body, timeoutMs, signal);
      assertNotTruncated(message.stop_reason === "max_tokens");
      const raw = requireToolInput(message.content);
      const usage = toUsage(message.usage);
      return usage === undefined ? { raw } : { raw, usage };
    },
  };
}

function callClient(
  client: MessagesClient,
  body: BuiltRequest,
  timeoutMs: number,
  signal: AbortSignal | undefined,
): Promise<AnthropicMessage> {
  return withRequestTimeout(timeoutMs, signal, (requestSignal) =>
    client.messages.create(body, { signal: requestSignal }),
  );
}

export function toUsage(usage: AnthropicMessage["usage"]): Usage | undefined {
  return toUsageFromCounts(usage?.input_tokens, usage?.output_tokens);
}
