import type { ProviderNotice, TranslateResult } from "../provider.js";

export interface GoogleTranslateHttpResponse {
  readonly status: number;
  readonly body: unknown;
}

export interface GoogleTranslateClient {
  translate(
    texts: readonly string[],
    sourceLang: string,
    targetLang: string,
    signal: AbortSignal,
  ): Promise<GoogleTranslateHttpResponse>;
}

export interface GoogleTranslateClientBundle {
  readonly client: GoogleTranslateClient;
}

export type GoogleTranslateResult = TranslateResult & {
  readonly notices: readonly ProviderNotice[];
};
