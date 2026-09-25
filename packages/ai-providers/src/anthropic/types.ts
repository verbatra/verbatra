import type { BuiltRequest } from "./request.js";

export interface AnthropicMessage {
  readonly content: readonly unknown[];
  readonly stop_reason?: string | null;
  readonly usage?: { readonly input_tokens?: number; readonly output_tokens?: number };
}

export interface AnthropicCallOptions {
  readonly signal?: AbortSignal;
  readonly timeout?: number;
}

export interface MessagesClient {
  messages: {
    create(body: BuiltRequest, options?: AnthropicCallOptions): Promise<AnthropicMessage>;
  };
}
