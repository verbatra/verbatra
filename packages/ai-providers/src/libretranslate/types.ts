import type { ProviderNotice, TranslateResult } from "../provider.js";

export interface LibreTranslateHttpResponse {
  readonly status: number;
  readonly body: unknown;
}

export type LibreTranslateTextFormat = "text" | "html";

export interface LibreTranslateClient {
  translate(
    texts: readonly string[],
    sourceLang: string,
    targetLang: string,
    format: LibreTranslateTextFormat,
    signal: AbortSignal,
  ): Promise<LibreTranslateHttpResponse>;
}

export interface LibreTranslateClientBundle {
  readonly client: LibreTranslateClient;
  readonly keyConfigured: boolean;
}

export type LibreTranslateResult = TranslateResult & {
  readonly notices: readonly ProviderNotice[];
};
