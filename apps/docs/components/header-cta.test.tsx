// @vitest-environment jsdom

import type { ComponentProps } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { docsStylesheetRules } from "@/lib/stylesheet-rules";

const location = vi.hoisted(() => ({ pathname: "/" }));
const track = vi.hoisted(() => vi.fn());

vi.mock("fumadocs-core/framework", () => ({ usePathname: () => location.pathname }));
vi.mock("fumadocs-core/link", () => ({
  default: (props: ComponentProps<"a">) => <a {...props} />,
}));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => `nav.${key}` }));
vi.mock("@/lib/umami", () => ({ trackUmamiEvent: track }));

const { HeaderCta, landingLocale } = await import("./header-cta");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mounted: { container: HTMLDivElement; root: Root } | undefined;

afterEach(() => {
  act(() => mounted?.root.unmount());
  mounted?.container.remove();
  mounted = undefined;
  track.mockReset();
});

function render(pathname: string): HTMLDivElement {
  location.pathname = pathname;
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mounted = { container, root };
  act(() => root.render(<HeaderCta />));
  return container;
}

describe("HeaderCta", () => {
  it("renders only on the landing page of each locale", () => {
    expect(landingLocale("/")).toBe("en");
    expect(landingLocale("/de")).toBe("de");
    expect(landingLocale("/fr/")).toBe("fr");
    expect(landingLocale("/docs")).toBeNull();
    expect(landingLocale("/de/docs/quickstart")).toBeNull();
    expect(landingLocale("/privacy")).toBeNull();
    expect(render("/docs").querySelector("a")).toBeNull();
  });

  it("links the quickstart in the page locale and starts hidden until the hero is gone", () => {
    const link = render("/de").querySelector("a");
    expect(link?.getAttribute("href")).toBe("/de/docs/quickstart");
    expect(link?.textContent).toBe("nav.label");
    expect(link?.className).toContain("vk-header-cta");
  });

  it("counts a click as click-cta from the header", () => {
    const link = render("/").querySelector("a");
    act(() => link?.click());
    expect(track).toHaveBeenCalledWith("click-cta", { location: "header", target: "get-started" });
  });

  it("takes no space until the hero is gone, and leaves again at the final call to action", () => {
    const rules = docsStylesheetRules().filter((rule) => rule.selector.includes("vk-header-cta"));
    const shown = rules.filter(
      (rule) => rule.declarations.display && rule.declarations.display !== "none",
    );
    expect(
      rules.find((rule) => rule.selector === ".vk-header-cta" && !rule.media)?.declarations,
    ).toEqual({ display: "none" });
    expect(shown.map((rule) => [rule.selector, rule.media])).toEqual([
      [
        "html[data-past-hero]:not([data-final-cta]) .vk-header-cta",
        "@media (width < 768px), (width >= 1280px), (orientation: landscape) and (height < 32rem)",
      ],
    ]);
    for (const rule of rules) {
      expect(rule.declarations.visibility).toBeUndefined();
      expect(rule.declarations.width).toBeUndefined();
    }
  });

  it("on a phone turned sideways, pins the search box so the call to action moves nothing", () => {
    const media =
      "@media (orientation: landscape) and (height < 32rem) and (768px <= width < 1280px)";
    const rules = docsStylesheetRules().filter((rule) => rule.media === media);
    const declared = (selector: string) =>
      rules.find((rule) => rule.selector === selector)?.declarations;
    expect(declared(".vk-header:has(.vk-header-cta) .vk-header-start")).toEqual({ flex: "none" });
    expect(declared(".vk-header:has(.vk-header-cta) .vk-header-search")).toEqual({
      "max-width": "12rem",
    });
  });
});
