// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Rail } from "./rail";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function mountRail(
  phoneWidth: boolean,
  reducedMotion = false,
): {
  link: HTMLAnchorElement;
  scroll: ReturnType<typeof vi.fn>;
} {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query.includes("max-width") ? phoneWidth : reducedMotion,
  }));
  const host = document.createElement("div");
  document.body.append(host);
  act(() => {
    createRoot(host).render(
      <Rail labelledBy="rail-heading">
        <ul>
          <li className="vk-rail-item">
            <a href="#one">one</a>
          </li>
          <li className="vk-rail-item" id="second">
            <a href="#two">two</a>
          </li>
        </ul>
      </Rail>,
    );
  });
  const scroll = vi.fn();
  const item = host.querySelector<HTMLElement>("#second");
  if (!item) throw new Error("second item missing");
  item.scrollIntoView = scroll;
  const link = item.querySelector("a");
  if (!link) throw new Error("second link missing");
  return { link, scroll };
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("Rail", () => {
  it("is a region named by its heading", () => {
    mountRail(true);
    expect(document.querySelector("section")?.getAttribute("aria-labelledby")).toBe("rail-heading");
  });

  it("scrolls a focused item to the start of the rail at phone width", () => {
    const { link, scroll } = mountRail(true);
    act(() => link.focus());
    expect(scroll).toHaveBeenCalledWith(
      expect.objectContaining({ inline: "start", block: "nearest" }),
    );
  });

  it("jumps instead of gliding under reduced motion", () => {
    const { link, scroll } = mountRail(true, true);
    act(() => link.focus());
    expect(scroll).toHaveBeenCalledWith(expect.objectContaining({ behavior: "auto" }));
  });

  it("glides otherwise", () => {
    const { link, scroll } = mountRail(true);
    act(() => link.focus());
    expect(scroll).toHaveBeenCalledWith(expect.objectContaining({ behavior: "smooth" }));
  });

  it("leaves the page alone once the rail is a grid", () => {
    const { link, scroll } = mountRail(false);
    act(() => link.focus());
    expect(scroll).not.toHaveBeenCalled();
  });

  it("sets no top margin on the rail, so the heading gap a section gives it survives", () => {
    const css = readFileSync(join(process.cwd(), "app/global.css"), "utf8");
    const rules = [...css.matchAll(/\.vk-rail \{([^}]*)\}/g)].map((match) => match[1] ?? "");
    expect(rules.length).toBeGreaterThan(0);
    for (const rule of rules) expect(rule).not.toMatch(/margin(-top|-block|):/);
  });
});
