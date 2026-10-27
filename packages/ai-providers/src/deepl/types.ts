import type { ProviderNotice, TranslateResult } from "../provider.js";

export interface DeepLTextResult {
  readonly text: string;
}

export interface DeepLTranslateOptions {
  readonly formality?: string;
  readonly glossary?: string;
  readonly tagHandling?: "xml";
  readonly tagHandlingVersion?: "v2";
  readonly ignoreTags?: readonly string[];
  readonly outlineDetection?: boolean;
}

export interface DeepLTranslateClient {
  translateText(
    texts: readonly string[],
    sourceLang: string | null,
    targetLang: string,
    options: DeepLTranslateOptions,
  ): Promise<DeepLTextResult[]>;
}

export interface DeepLClientBundle {
  readonly client: DeepLTranslateClient;
  readonly freeAccount: boolean;
}

export type DeepLTranslateResult = TranslateResult & {
  readonly notices: readonly ProviderNotice[];
};
