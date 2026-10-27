import manifest from "./licenses.generated.json";
import type { LicenseGroup, LicenseText, ThirdPartyLicenses } from "./third-party-licenses";

export const LICENSES: ThirdPartyLicenses = manifest;
const TEXTS = new Map(LICENSES.texts.map((text) => [text.id, text]));
const OWN_TEXT_IDS = new Set(
  [...LICENSES.assets, ...LICENSES.groups.flatMap((group) => group.packages)].map(
    (entry) => entry.textId,
  ),
);
const FALLBACK_HOME = new Map<string, string>();
for (const group of LICENSES.groups) {
  for (const id of group.fallbackTextIds) {
    if (!OWN_TEXT_IDS.has(id) && !FALLBACK_HOME.has(id)) FALLBACK_HOME.set(id, group.license);
  }
}

export function textsUsedBy(entries: ReadonlyArray<{ textId: string | null }>): LicenseText[] {
  const ids = [...new Set(entries.map((entry) => entry.textId))];
  return ids.flatMap((id) => {
    const text = id === null ? undefined : TEXTS.get(id);
    return text === undefined ? [] : [text];
  });
}

export function fallbackTexts(group: LicenseGroup): LicenseText[] {
  return group.fallbackTextIds.flatMap((id) => {
    const text = FALLBACK_HOME.get(id) === group.license ? TEXTS.get(id) : undefined;
    return text === undefined ? [] : [text];
  });
}

export function usageCount(
  entries: ReadonlyArray<{ textId: string | null }>,
  id: string | null,
): number {
  return entries.filter((entry) => entry.textId === id).length;
}
