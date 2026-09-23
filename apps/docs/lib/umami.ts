export interface UmamiEventData {
  [key: string]: string;
}

interface UmamiTracker {
  track: (eventName: string, eventData?: UmamiEventData) => void;
}

declare global {
  interface Window {
    umami?: UmamiTracker;
  }
}

export function trackUmamiEvent(eventName: string, eventData?: UmamiEventData): void {
  if (typeof window === "undefined") return;
  window.umami?.track(eventName, eventData);
}

export const UMAMI_OPT_OUT_KEY = "umami.disabled";

export type AnalyticsPreference = "counted" | "opted-out" | "do-not-track" | "unavailable";

const DO_NOT_TRACK_VALUES: ReadonlyArray<unknown> = [1, "1", "yes"];

interface DoNotTrackSources {
  readonly doNotTrack?: unknown;
  readonly msDoNotTrack?: unknown;
}

function sendsDoNotTrack(): boolean {
  const win = window as DoNotTrackSources;
  const nav = window.navigator as DoNotTrackSources;
  const signal = win.doNotTrack || nav.doNotTrack || nav.msDoNotTrack;
  return DO_NOT_TRACK_VALUES.includes(signal);
}

function localStorageOrNull(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readAnalyticsPreference(): AnalyticsPreference {
  const storage = localStorageOrNull();
  if (!storage) return "unavailable";
  try {
    if (storage.getItem(UMAMI_OPT_OUT_KEY)) return "opted-out";
  } catch {
    return "unavailable";
  }
  return sendsDoNotTrack() ? "do-not-track" : "counted";
}

export function setAnalyticsOptOut(optOut: boolean): AnalyticsPreference {
  const storage = localStorageOrNull();
  if (!storage) return "unavailable";
  try {
    if (optOut) {
      storage.setItem(UMAMI_OPT_OUT_KEY, "1");
    } else {
      storage.removeItem(UMAMI_OPT_OUT_KEY);
    }
  } catch {
    return "unavailable";
  }
  return readAnalyticsPreference();
}
