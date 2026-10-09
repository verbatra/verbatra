// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { docsStylesheetRules } from "@/lib/stylesheet-rules";

const track = vi.hoisted(() => vi.fn());
vi.mock("@/lib/umami", () => ({ trackUmamiEvent: track }));

const { MarqueeToggle } = await import("./marquee-toggle");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mounted: { container: HTMLDivElement; root: Root } | undefined;

afterEach(() => {
  act(() => mounted?.root.unmount());
  mounted?.container.remove();
  mounted = undefined;
});

describe("MarqueeToggle", () => {
  it("is a named toggle that pauses and resumes the marquee and counts each switch", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    mounted = { container, root };
    act(() => root.render(<MarqueeToggle label="Pause the scrolling lists" />));
    const button = container.querySelector("button");
    expect(button?.getAttribute("aria-label")).toBe("Pause the scrolling lists");
    expect(button?.getAttribute("aria-pressed")).toBe("false");
    act(() => button?.click());
    expect(button?.getAttribute("aria-pressed")).toBe("true");
    expect(track).toHaveBeenLastCalledWith("toggle-marquee", {
      state: "paused",
      location: "marquee",
    });
    act(() => button?.click());
    expect(button?.getAttribute("aria-pressed")).toBe("false");
    expect(track).toHaveBeenLastCalledWith("toggle-marquee", {
      state: "playing",
      location: "marquee",
    });
  });

  it("pauses the tracks through its pressed state or while the band is off screen", () => {
    const paused = docsStylesheetRules()
      .filter((rule) => rule.declarations["animation-play-state"] === "paused")
      .flatMap((rule) => rule.selector.split(", "));
    expect(paused).toContain(
      '.vk-marquee-band:has(.vk-marquee-toggle[aria-pressed="true"]) .vk-track',
    );
    expect(paused).toContain(".vk-marquee-band[data-offscreen] .vk-track");
    const reduced = docsStylesheetRules().filter(
      (rule) => rule.selector === ".vk-marquee-toggle" && rule.media.includes("reduce"),
    );
    expect(reduced.map((rule) => rule.declarations.display)).toEqual(["none"]);
  });

  it("sits inside the marquee band that the presence observer watches", async () => {
    vi.doMock("next-intl/server", () => ({
      getTranslations: async () => (key: string) => key,
      getLocale: async () => "en",
    }));
    const { Marquee } = await import("./marquee");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const doc = new DOMParser().parseFromString(renderToStaticMarkup(await Marquee()), "text/html");
    const button = doc.querySelector(".vk-marquee-toggle");
    expect(
      button?.closest('[data-presence="marquee"]')?.classList.contains("vk-marquee-band"),
    ).toBe(true);
    expect(button?.getAttribute("aria-label")).toBe("pause");
  });
});
