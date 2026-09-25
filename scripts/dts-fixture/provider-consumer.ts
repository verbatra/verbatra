import {
  type CreateProvider,
  loadConfig,
  type ProviderKind,
  type ProviderNetwork,
  type ProviderRetry,
  type ProviderRetryListener,
  type TranslateRequest,
  type TranslateResult,
  type TranslationProvider,
  translate,
  type VerbatraConfigInput,
} from "@verbatra/sdk";

const kind: ProviderKind = "machine-translation";

function echoTranslate(request: TranslateRequest): Promise<TranslateResult> {
  const values = new Map<string, string>();
  const terms: number = request.glossary?.terms.length ?? 0;
  for (const entry of request.entries) {
    values.set(entry.key, `${request.targetLocale}:${entry.value}:${terms}`);
  }
  return Promise.resolve({ values, integrity: new Map(), notices: [] });
}

export const echoProvider: TranslationProvider = {
  id: "echo",
  kind,
  supportsGlossary: false,
  translateBatch: echoTranslate,
};

export const logRetries: ProviderRetryListener = (retry: ProviderRetry) => {
  const delay: number | undefined = retry.delayMs;
  void [retry.attempt, delay, retry.status];
};

export const createEcho: CreateProvider = (_config, context, hooks) => {
  const network: ProviderNetwork | undefined = context?.network;
  const onRetry: ProviderRetryListener | undefined = hooks?.onRetry;
  void [network?.policy.rules.length, onRetry];
  return echoProvider;
};

const deeplConfig: VerbatraConfigInput = {
  sourceLocale: "en",
  targetLocales: ["de"],
  format: "i18next-json",
  files: { pattern: "locales/{locale}.json" },
  provider: { id: "deepl", options: {} },
};

export async function runWithEcho(): Promise<number> {
  const config = await loadConfig({ configOverride: deeplConfig });
  const summary = await translate({ config }, { createProvider: createEcho });
  return summary.locales.length;
}

// @ts-expect-error a provider must declare whether it is an LLM or a machine-translation API.
export const kindless: TranslationProvider = {
  id: "x",
  supportsGlossary: false,
  translateBatch: echoTranslate,
};
