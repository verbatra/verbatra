import type { TranslationEntry } from "@verbatra/core";
import type { BuiltRequest } from "./anthropic/request.js";
import type { AnthropicMessage, MessagesClient } from "./anthropic/types.js";
import type {
  DeepLTextResult,
  DeepLTranslateClient,
  DeepLTranslateOptions,
} from "./deepl/types.js";
import type { GeminiRequest } from "./gemini/request.js";
import type { GeminiClient, GeminiResponse } from "./gemini/types.js";
import type {
  GoogleTranslateClient,
  GoogleTranslateHttpResponse,
} from "./google-translate/types.js";
import type { OpenAiRequest } from "./openai/request.js";
import type { OpenAiClient, OpenAiCompletion, OpenAiMessage } from "./openai/types.js";
import type { PlaceholderExtractor } from "./provider.js";

export function entry(
  key: string,
  value: string,
  placeholders: readonly string[] = [],
  extra: { description?: string; meaning?: string } = {},
): TranslationEntry {
  return { key, namespace: "messages", value, placeholders, isPlural: false, ...extra };
}

export const regexExtractor: PlaceholderExtractor = (value) =>
  value.match(/\{\{[^{}]+\}\}|\{[^{}]+\}/g) ?? [];

export function toolMessage(
  translations: ReadonlyArray<{ key: string; value: string }>,
  usage?: { input_tokens?: number; output_tokens?: number },
): AnthropicMessage {
  const content = [
    { type: "tool_use", id: "tool-1", name: "submit_translations", input: { translations } },
  ];
  return usage === undefined ? { content } : { content, usage };
}

export function truncatedToolMessage(
  translations: ReadonlyArray<{ key: string; value: string }>,
): AnthropicMessage {
  return { ...toolMessage(translations), stop_reason: "max_tokens" };
}

export function stubClient(message: AnthropicMessage): {
  client: MessagesClient;
  calls: BuiltRequest[];
} {
  const calls: BuiltRequest[] = [];
  const client: MessagesClient = {
    messages: {
      create: async (body) => {
        calls.push(body);
        return message;
      },
    },
  };
  return { client, calls };
}

export function firstCallOf<T>(calls: readonly T[]): T {
  const call = calls[0];
  if (call === undefined) {
    throw new Error("expected the client to have been called at least once");
  }
  return call;
}

export function openAiCompletion(
  message: OpenAiMessage,
  usage?: { prompt_tokens?: number; completion_tokens?: number },
): OpenAiCompletion {
  const choices = [{ message }];
  return usage === undefined ? { choices } : { choices, usage };
}

export function openAiResult(
  translations: ReadonlyArray<{ key: string; value: string }>,
  usage?: { prompt_tokens?: number; completion_tokens?: number },
): OpenAiCompletion {
  return openAiCompletion({ content: JSON.stringify({ translations }) }, usage);
}

export function truncatedOpenAiCompletion(
  translations: ReadonlyArray<{ key: string; value: string }>,
): OpenAiCompletion {
  return {
    choices: [{ message: { content: JSON.stringify({ translations }) }, finish_reason: "length" }],
  };
}

export function openAiStubClient(completion: OpenAiCompletion): {
  client: OpenAiClient;
  calls: OpenAiRequest[];
} {
  const calls: OpenAiRequest[] = [];
  const client: OpenAiClient = {
    chat: {
      completions: {
        create: async (body) => {
          calls.push(body);
          return completion;
        },
      },
    },
  };
  return { client, calls };
}

export function geminiResult(
  translations: ReadonlyArray<{ key: string; value: string }>,
  usage?: { promptTokenCount?: number; candidatesTokenCount?: number },
): GeminiResponse {
  const base: GeminiResponse = {
    text: JSON.stringify({ translations }),
    candidates: [{ finishReason: "STOP" }],
  };
  return usage === undefined ? base : { ...base, usageMetadata: usage };
}

export function geminiStubClient(response: GeminiResponse): {
  client: GeminiClient;
  calls: GeminiRequest[];
} {
  const calls: GeminiRequest[] = [];
  const client: GeminiClient = {
    models: {
      generateContent: async (request) => {
        calls.push(request);
        return response;
      },
    },
  };
  return { client, calls };
}

export interface DeepLCall {
  readonly texts: readonly string[];
  readonly sourceLang: string | null;
  readonly targetLang: string;
  readonly options: DeepLTranslateOptions;
}

export function deeplResult(texts: readonly string[]): DeepLTextResult[] {
  return texts.map((text) => ({ text }));
}

export function deeplStubClient(results: readonly DeepLTextResult[]): {
  client: DeepLTranslateClient;
  calls: DeepLCall[];
} {
  const calls: DeepLCall[] = [];
  const client: DeepLTranslateClient = {
    translateText: async (texts, sourceLang, targetLang, options) => {
      calls.push({ texts, sourceLang, targetLang, options });
      return [...results];
    },
  };
  return { client, calls };
}

export interface GoogleTranslateCall {
  readonly texts: readonly string[];
  readonly sourceLang: string;
  readonly targetLang: string;
}

export function googleTranslateSuccess(
  translatedTexts: readonly string[],
): GoogleTranslateHttpResponse {
  return {
    status: 200,
    body: { data: { translations: translatedTexts.map((translatedText) => ({ translatedText })) } },
  };
}

export function googleTranslateError(
  status: number,
  reasons: readonly string[] = [],
): GoogleTranslateHttpResponse {
  return {
    status,
    body: { error: { errors: reasons.map((reason) => ({ reason })) } },
  };
}

export function googleTranslateStubClient(response: GoogleTranslateHttpResponse): {
  client: GoogleTranslateClient;
  calls: GoogleTranslateCall[];
} {
  const calls: GoogleTranslateCall[] = [];
  const client: GoogleTranslateClient = {
    translate: async (texts, sourceLang, targetLang) => {
      calls.push({ texts, sourceLang, targetLang });
      return response;
    },
  };
  return { client, calls };
}
