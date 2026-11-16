import { type AnalyticsChoice, hasPrivacySignal, readChoiceCookie } from "@/lib/analytics-choice";

export const CHOICE_EVENT = "verbatra:analytics-choice";

interface LegacyDoNotTrack {
  readonly msDoNotTrack?: string | null;
  readonly globalPrivacyControl?: boolean;
}

export function browserChoice(): AnalyticsChoice | undefined {
  return readChoiceCookie(document.cookie);
}

export function browserHasSignal(): boolean {
  const legacy: Navigator & LegacyDoNotTrack = navigator;
  const dnt =
    [navigator.doNotTrack, legacy.msDoNotTrack, Reflect.get(window, "doNotTrack")].find(
      (value) => value === "1" || value === "yes",
    ) ?? null;
  return hasPrivacySignal({ gpc: legacy.globalPrivacyControl === true, dnt });
}

export function announceChoice(): void {
  window.dispatchEvent(new Event(CHOICE_EVENT));
}

export function reloadPage(): void {
  window.location.reload();
}
