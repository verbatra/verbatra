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
