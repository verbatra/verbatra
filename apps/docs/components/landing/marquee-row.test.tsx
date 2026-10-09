// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { MarqueeRow } from "./marquee-row";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("MarqueeRow", () => {
  it("scrolls a focused link fully into view, since Chrome leaves a partly visible one clipped", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => {
      root.render(
        <MarqueeRow direction="right">
          <a href="/docs/formats">YAML</a>
        </MarqueeRow>,
      );
    });
    const row = container.querySelector<HTMLElement>(".vk-marquee");
    expect(row?.dataset.direction).toBe("right");
    const link = container.querySelector("a");
    if (!link) throw new Error("no link");
    const scrollIntoView = vi.fn();
    link.scrollIntoView = scrollIntoView;
    act(() => link.focus());
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", inline: "nearest" });
    act(() => root.unmount());
    container.remove();
  });
});
