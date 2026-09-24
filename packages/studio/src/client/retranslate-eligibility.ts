import type { IntegrityPillView } from "./integrity-pill.js";

export interface RetranslateCapabilities {
  readonly spend: boolean;
  readonly writeToDisk: boolean;
}

export function canRetranslate(
  capabilities: RetranslateCapabilities | undefined,
  pill: IntegrityPillView | null,
): boolean {
  return (
    capabilities?.spend === true &&
    capabilities.writeToDisk &&
    pill !== null &&
    pill.tone === "danger"
  );
}

export function canRetranslateReviewed(capabilities: RetranslateCapabilities | undefined): boolean {
  return capabilities?.spend === true && capabilities.writeToDisk;
}
