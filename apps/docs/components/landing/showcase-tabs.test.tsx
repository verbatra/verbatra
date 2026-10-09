// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
const trackUmamiEvent = vi.fn();
vi.mock("@/lib/umami", () => ({ trackUmamiEvent }));

const { SHOWCASE_ID, ShowcaseTabs, STUDIO_SHOT } = await import("./showcase-tabs");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("ShowcaseTabs", () => {
  let mounted: { container: HTMLDivElement; root: Root } | undefined;

  function render(): HTMLDivElement {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => {
      root.render(
        <ShowcaseTabs studioHref="/de/docs/review-in-studio">
          <p data-part="try-it">try</p>
        </ShowcaseTabs>,
      );
    });
    mounted = { container, root };
    return container;
  }

  function tabs(container: HTMLElement): HTMLButtonElement[] {
    return [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  }

  async function press(target: HTMLElement, key: string): Promise<void> {
    await act(async () => {
      target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
    });
  }

  beforeEach(() => {
    trackUmamiEvent.mockReset();
  });

  afterEach(() => {
    if (mounted) {
      const { container, root } = mounted;
      act(() => root.unmount());
      container.remove();
      mounted = undefined;
    }
  });

  it("wires Try it and Studio as tabs controlling their panels, Try it first", () => {
    const container = render();
    const [tryIt, studio] = tabs(container);
    expect(tabs(container).map((tab) => tab.textContent)).toEqual(["tabs.tryIt", "tabs.studio"]);
    expect(tryIt?.getAttribute("aria-selected")).toBe("true");
    expect(tryIt?.getAttribute("aria-controls")).toBe(`${SHOWCASE_ID}-panel-tryIt`);
    expect(studio?.getAttribute("tabindex")).toBe("-1");
    const panel = container.querySelector(`#${SHOWCASE_ID}-panel-tryIt`);
    expect(panel?.getAttribute("role")).toBe("tabpanel");
    expect(panel?.querySelector('[data-part="try-it"]')).not.toBeNull();
    expect(container.querySelector(`#${SHOWCASE_ID}-panel-studio`)?.hasAttribute("inert")).toBe(
      true,
    );
  });

  it("mounts the Studio screenshot only once its tab opens, lazily, with a link to the guide", async () => {
    const container = render();
    expect(container.querySelector("img")).toBeNull();
    const [tryIt] = tabs(container);
    if (!tryIt) throw new Error("no tab");
    await press(tryIt, "End");
    const image = container.querySelector("img");
    expect(image?.getAttribute("src")).toContain(encodeURIComponent(STUDIO_SHOT.src));
    expect(image?.getAttribute("loading")).toBe("lazy");
    expect(image?.getAttribute("alt")).toBe("studio.alt");
    expect(container.querySelector(".vk-showcase-caption a")?.getAttribute("href")).toBe(
      "/de/docs/review-in-studio",
    );
    expect(document.activeElement?.textContent).toBe("tabs.studio");
    expect(trackUmamiEvent).toHaveBeenCalledWith("showcase-tab", { tab: "studio" });
  });

  it("moves between the tabs with the arrow keys and Home, counting each switch once", async () => {
    const container = render();
    const [tryIt] = tabs(container);
    if (!tryIt) throw new Error("no tab");
    await press(tryIt, "ArrowRight");
    expect(tabs(container)[1]?.getAttribute("aria-selected")).toBe("true");
    const studio = tabs(container)[1];
    if (!studio) throw new Error("no tab");
    await press(studio, "Home");
    expect(tabs(container)[0]?.getAttribute("aria-selected")).toBe("true");
    expect(trackUmamiEvent.mock.calls).toEqual([
      ["showcase-tab", { tab: "studio" }],
      ["showcase-tab", { tab: "tryIt" }],
    ]);
  });

  it("uses the shared segmented TabList variant rather than its own tab classes", () => {
    const container = render();
    expect(container.querySelector('[role="tablist"]')?.classList.contains("vk-segmented")).toBe(
      true,
    );
    for (const tab of tabs(container))
      expect(tab.className).toContain("rounded-(--radius-segment)");
    for (const file of ["showcase-tabs.tsx", "command-panel.tsx"]) {
      const source = readFileSync(join(process.cwd(), "components/landing", file), "utf8");
      expect(source, file).toContain('variant="segmented"');
      expect(source, file).not.toMatch(/TAB_CLASS|function panelProps|rounded-\[7px\]/);
    }
    const css = readFileSync(join(process.cwd(), "app/global.css"), "utf8");
    expect(css).toContain("--radius-segment: 7px;");
  });
});
