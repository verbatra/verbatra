import { useSyncExternalStore } from "react";
import { createPanelOpenStore } from "../client/panel-open-store.js";

export const icuPreviewOpenStore = createPanelOpenStore();

export function useIcuPreviewOpen(): boolean {
  return useSyncExternalStore(icuPreviewOpenStore.subscribe, icuPreviewOpenStore.isOpen);
}
