import { describe, expect, it, vi } from "vitest";
import { createPanelOpenStore } from "./panel-open-store.js";

describe("createPanelOpenStore", () => {
  it("starts closed unless told otherwise", () => {
    expect(createPanelOpenStore().isOpen()).toBe(false);
    expect(createPanelOpenStore(true).isOpen()).toBe(true);
  });

  it("tells each subscriber once per real change", () => {
    const store = createPanelOpenStore();
    const listener = vi.fn();
    store.subscribe(listener);

    store.setOpen(true);
    store.setOpen(true);
    store.setOpen(false);

    expect(listener).toHaveBeenCalledTimes(2);
    expect(store.isOpen()).toBe(false);
  });

  it("stops telling a subscriber that unsubscribed", () => {
    const store = createPanelOpenStore();
    const listener = vi.fn();
    const stop = store.subscribe(listener);

    stop();
    store.setOpen(true);

    expect(listener).not.toHaveBeenCalled();
  });
});
