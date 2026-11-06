import { createContext, useContext, useSyncExternalStore } from "react";
import { createSampleSessions } from "../client/icu-sample-session.js";
import { createPanelOpenStore } from "../client/panel-open-store.js";

const SAMPLE_SESSION_LIMIT = 50;

export const icuPreviewOpenStore = createPanelOpenStore();

export const icuSampleSessions = createSampleSessions(SAMPLE_SESSION_LIMIT);

export function resetIcuPreviewSession(): void {
  icuPreviewOpenStore.setOpen(false);
  icuSampleSessions.clear();
}

export function useIcuPreviewOpen(): boolean {
  return useSyncExternalStore(icuPreviewOpenStore.subscribe, icuPreviewOpenStore.isOpen);
}

const IcuPreviewAvailability = createContext(false);

export const IcuPreviewAvailabilityProvider = IcuPreviewAvailability.Provider;

export function useIcuPreviewAvailable(): boolean {
  return useContext(IcuPreviewAvailability);
}
