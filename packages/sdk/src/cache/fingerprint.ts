import { stableStringHash } from "@verbatra/core";
import type { ProviderConfig } from "../config/provider-config.js";
import type { VerbatraConfig } from "../config/schema.js";
import { sortRecordKeys } from "../record-utils.js";

function fingerprintModel(provider: ProviderConfig): string | null {
  if (!("options" in provider)) {
    return null;
  }
  const options: Record<string, unknown> = provider.options;
  const model = options.model;
  return typeof model === "string" ? model : null;
}

function sortGlossary(
  glossary: Readonly<Record<string, string>> | undefined,
): Record<string, string> {
  return glossary === undefined ? {} : sortRecordKeys(glossary);
}

export function computeFingerprint(config: VerbatraConfig): string {
  const canonical = JSON.stringify({
    provider: config.provider.id,
    model: fingerprintModel(config.provider),
    tone: config.tone ?? null,
    glossary: sortGlossary(config.glossary),
  });
  return stableStringHash(canonical);
}
