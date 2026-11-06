export interface PanelOpenStore {
  isOpen(): boolean;
  setOpen(open: boolean): void;
  subscribe(listener: () => void): () => void;
}

export function createPanelOpenStore(initiallyOpen = false): PanelOpenStore {
  let open = initiallyOpen;
  const listeners = new Set<() => void>();
  return {
    isOpen: () => open,
    setOpen(next: boolean): void {
      if (next === open) {
        return;
      }
      open = next;
      for (const listener of listeners) {
        listener();
      }
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
