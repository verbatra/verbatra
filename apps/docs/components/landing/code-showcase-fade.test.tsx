import { describe, expect, it, vi } from "vitest";

const animate = vi.hoisted(() => vi.fn());
vi.mock("motion/mini", () => ({ animate }));

const { fadeInPanel } = await import("./code-showcase-fade");

describe("fadeInPanel", () => {
  it("fades and lifts the panel in with opacity and transform only", () => {
    const element = { animate: () => undefined } as unknown as HTMLElement;
    fadeInPanel(element);
    expect(animate).toHaveBeenCalledWith(
      element,
      { opacity: [0, 1], transform: ["translateY(4px)", "none"] },
      { duration: 0.24, ease: [0.22, 1, 0.36, 1] },
    );
  });

  it("does nothing where the browser cannot animate an element", () => {
    animate.mockClear();
    fadeInPanel({} as HTMLElement);
    expect(animate).not.toHaveBeenCalled();
  });
});
