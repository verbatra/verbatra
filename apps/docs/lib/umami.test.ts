// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { trackUmamiEvent } from "./umami";

describe("trackUmamiEvent", () => {
  afterEach(() => {
    window.umami = undefined;
  });

  it("calls window.umami.track with the event name and data", () => {
    const track = vi.fn();
    window.umami = { track };

    trackUmamiEvent("copy-install-command", { manager: "pnpm" });

    expect(track).toHaveBeenCalledWith("copy-install-command", { manager: "pnpm" });
  });

  it("calls window.umami.track with no data when omitted", () => {
    const track = vi.fn();
    window.umami = { track };

    trackUmamiEvent("copy-ai-prompt");

    expect(track).toHaveBeenCalledWith("copy-ai-prompt", undefined);
  });

  it("does not throw when the tracker script has not loaded yet", () => {
    window.umami = undefined;

    expect(() => trackUmamiEvent("locale-switch", { to: "de", from: "en" })).not.toThrow();
  });
});
