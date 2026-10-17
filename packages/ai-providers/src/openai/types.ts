import type { OpenAiRequest } from "./request.js";

export interface OpenAiMessage {
  readonly content?: string | null;
  readonly refusal?: string | null;
}

export interface OpenAiChoice {
  readonly message: OpenAiMessage;
  readonly finish_reason?: string | null;
}

export interface OpenAiCompletion {
  readonly choices: readonly OpenAiChoice[];
  readonly usage?: { readonly prompt_tokens?: number; readonly completion_tokens?: number };
}

export interface OpenAiCallOptions {
  readonly signal?: AbortSignal;
  readonly timeout?: number;
}

export interface OpenAiClient {
  chat: {
    completions: {
      create(body: OpenAiRequest, options?: OpenAiCallOptions): Promise<OpenAiCompletion>;
    };
  };
}
