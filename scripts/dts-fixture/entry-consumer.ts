import {
  approveEntries,
  type BatchEntrySkipped,
  BatchInterruptedError,
  defineConfig,
  glossaryDraftCheck,
  glossaryHits,
  isMachineTranslationEnabled,
  keyValue,
  type LockWaitListener,
  loadConfig,
  localeIntegrity,
  type ProgressListener,
  type RetranslateBatchOutcome,
  type ReviewBatchOutcome,
  rejectEntries,
  releaseHeldLocks,
  retranslateEntries,
  type VerbatraConfig,
  type VerbatraConfigInput,
} from "@verbatra/sdk";

export const humanOnlyConfig: VerbatraConfigInput = defineConfig({
  sourceLocale: "en",
  targetLocales: ["de"],
  format: "i18next-json",
  files: { pattern: "locales/{locale}.json" },
  provider: { id: "none" },
});

export async function machineTranslationEnabled(): Promise<boolean> {
  return isMachineTranslationEnabled(await loadConfig({ configOverride: humanOnlyConfig }));
}

const onLockWait: LockWaitListener = (event) => {
  const holderPid: number | undefined = event.holder?.pid;
  void [event.lockPath, event.elapsedMs, holderPid];
};

export const onProgress: ProgressListener = (event) => {
  void event.type;
};

function skippedCode(outcome: ReviewBatchOutcome | RetranslateBatchOutcome): string | undefined {
  if (outcome.ok || !("skipped" in outcome)) {
    return undefined;
  }
  const skipped: BatchEntrySkipped = outcome;
  return skipped.code;
}

export async function decide(config: VerbatraConfig): Promise<readonly (string | undefined)[]> {
  const entries = [{ locale: "de", key: "cart.title", expectedValue: "Warenkorb" }];
  const approved = await approveEntries({
    config,
    entries,
    reviewer: "reviewer",
    onLockWait,
    lockAcquireTimeoutMs: 5_000,
  });
  const rejected = await rejectEntries({ config, entries });
  try {
    const retranslated = await retranslateEntries({
      config,
      entries: [{ locale: "de", key: "cart.title" }],
      includeHuman: false,
      lockAcquireTimeoutMs: 0,
    });
    return [...approved.results, ...rejected.results, ...retranslated.results].map(skippedCode);
  } catch (error) {
    if (error instanceof BatchInterruptedError) {
      const { locale, key } = error.entry;
      return [locale, key, ...error.results.map(skippedCode)];
    }
    throw error;
  } finally {
    await releaseHeldLocks();
  }
}

export async function inspect(config: VerbatraConfig): Promise<number> {
  const value = await keyValue({ config, locale: "de", key: "cart.title" });
  const description: string | undefined = value.description;
  const hits = glossaryHits({
    glossary: undefined,
    locale: "de",
    sourceLocale: "en",
    text: value.source,
  });
  const draft = glossaryDraftCheck({
    glossary: undefined,
    locale: "de",
    sourceLocale: "en",
    source: value.source,
    draft: value.target ?? "",
  });
  const broken = await localeIntegrity({ config, locales: ["de"] });
  return (
    (description?.length ?? 0) +
    hits.terms.length +
    draft.terms.filter((term) => term.forbiddenUsed.length > 0).length +
    broken.reduce((total, locale) => total + locale.entries.length, 0)
  );
}
