import { stableStringHash } from "@verbatra/core";
import type { MachineProviderConfig, ProviderConfig } from "../config/provider-config.js";
import type { VerbatraConfig } from "../config/schema.js";
import { sortRecordKeys } from "../record-utils.js";

function fingerprintModel(provider: ProviderConfig): string | null {
  const options: Record<string, unknown> = provider.options;
  const model = options.model;
  return typeof model === "string" ? model : null;
}

function fingerprintLocaleMap(provider: MachineProviderConfig): Record<string, string> | undefined {
  const localeMap = provider.options.localeMap;
  if (localeMap === undefined || Object.keys(localeMap).length === 0) {
    return undefined;
  }
  return sortRecordKeys(localeMap);
}

function sortGlossary(
  glossary: Readonly<Record<string, string>> | undefined,
): Record<string, string> {
  return glossary === undefined ? {} : sortRecordKeys(glossary);
}

const HUMAN_ONLY_CANONICAL = JSON.stringify({ provider: "none" });

export function computeFingerprint(config: VerbatraConfig): string {
  if (config.provider.id === "none") {
    return stableStringHash(HUMAN_ONLY_CANONICAL);
  }
  const localeMap = fingerprintLocaleMap(config.provider);
  const canonical = JSON.stringify({
    provider: config.provider.id,
    model: fingerprintModel(config.provider),
    tone: config.tone ?? null,
    glossary: sortGlossary(config.glossary),
    ...(localeMap !== undefined ? { localeMap } : {}),
  });
  return stableStringHash(canonical);
}
