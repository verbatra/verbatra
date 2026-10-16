// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import de from "@/messages/de.json";
import en from "@/messages/en.json";
import es from "@/messages/es.json";
import fr from "@/messages/fr.json";
import {
  MAX_SCROLL_RETRIES,
  passedFirstViewport,
  ScrollTop,
  STALL_FRAMES,
  scrollToTop,
} from "./scroll-top";

type ObserverCallback = (entries: ReadonlyArray<Partial<IntersectionObserverEntry>>) => void;

const observers: Array<{ callback: ObserverCallback; disconnect: () => void }> = [];

class FakeObserver {
  callback: ObserverCallback;
  disconnect = vi.fn();
  constructor(callback: ObserverCallback) {
    this.callback = callback;
    observers.push(this);
  }
  observe(): void {}
}

const css = readFileSync(join(process.cwd(), "app/global.css"), "utf8");

function rule(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  return css.slice(start, css.indexOf("}", start));
}

afterEach(() => {
  observers.length = 0;
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("passedFirstViewport", () => {
  it("is true only once the one-viewport sentinel has scrolled out above the screen", () => {
    const box = (bottom: number) => ({ bottom }) as DOMRectReadOnly;
    expect(passedFirstViewport({ isIntersecting: true, boundingClientRect: box(800) })).toBe(false);
    expect(passedFirstViewport({ isIntersecting: false, boundingClientRect: box(900) })).toBe(
      false,
    );
    expect(passedFirstViewport({ isIntersecting: false, boundingClientRect: box(-1) })).toBe(true);
  });
});

describe("scrollToTop", () => {
  function fakeWindow(reduced: boolean) {
    const main = document.createElement("main");
    main.id = "main-content";
    main.tabIndex = -1;
    document.body.append(main);
    const focus = vi.spyOn(main, "focus");
    const frames: Array<() => void> = [];
    const listeners = new Map<string, () => void>();
    const state = { scrollY: 3000 };
    const win = {
      matchMedia: (query: string) => ({ matches: query.includes("no-preference") && !reduced }),
      scrollTo: vi.fn(),
      get scrollY() {
        return state.scrollY;
      },
      requestAnimationFrame: (callback: () => void) => frames.push(callback),
      cancelAnimationFrame: vi.fn(),
      addEventListener: (type: string, listener: () => void) => listeners.set(type, listener),
      removeEventListener: (type: string) => listeners.delete(type),
      document,
    } as unknown as Window;
    const tick = (count: number) => {
      for (let index = 0; index < count; index += 1) frames.shift()?.();
    };
    return { win, focus, state, tick, listeners, frames };
  }

  it("issues the smooth scroll again when something stops it short of the top", () => {
    const { win, state, tick, frames } = fakeWindow(false);
    scrollToTop("main-content", win);
    expect(win.scrollTo).toHaveBeenCalledTimes(1);
    state.scrollY = 2000;
    tick(1);
    tick(STALL_FRAMES);
    expect(win.scrollTo).toHaveBeenCalledTimes(2);
    expect(win.scrollTo).toHaveBeenLastCalledWith({ top: 0, behavior: "smooth" });
    state.scrollY = 0;
    tick(1);
    expect(frames).toHaveLength(0);
  });

  it("gives up after a bounded number of retries", () => {
    const { win, tick, frames } = fakeWindow(false);
    scrollToTop("main-content", win);
    tick((STALL_FRAMES + 1) * (MAX_SCROLL_RETRIES + 2));
    expect(win.scrollTo).toHaveBeenCalledTimes(1 + MAX_SCROLL_RETRIES);
    expect(frames).toHaveLength(0);
  });

  it("leaves the page to the reader as soon as they scroll, touch or type", () => {
    const { win, tick, listeners, frames } = fakeWindow(false);
    scrollToTop("main-content", win);
    expect([...listeners.keys()].sort()).toEqual(["keydown", "pointerdown", "touchstart", "wheel"]);
    listeners.get("wheel")?.();
    expect(listeners.size).toBe(0);
    expect(win.cancelAnimationFrame).toHaveBeenCalled();
    frames.length = 0;
    tick(STALL_FRAMES * 4);
    expect(win.scrollTo).toHaveBeenCalledTimes(1);
  });

  it("watches nothing after an instant jump", () => {
    const { win, frames, listeners } = fakeWindow(true);
    scrollToTop("main-content", win);
    expect(frames).toHaveLength(0);
    expect(listeners.size).toBe(0);
  });

  it("scrolls smoothly when motion is welcome and moves focus to main without a second jump", () => {
    const { win, focus } = fakeWindow(false);
    scrollToTop("main-content", win);
    expect(win.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "smooth" });
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(document.activeElement?.id).toBe("main-content");
  });

  it("jumps at once under reduced motion", () => {
    const { win } = fakeWindow(true);
    scrollToTop("main-content", win);
    expect(win.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "instant" });
  });
});

describe("ScrollTop", () => {
  it("renders no button on the server, so a page without JavaScript has none", () => {
    const html = renderToString(<ScrollTop label="Back to top" targetId="main-content" />);
    expect(html).not.toContain("<button");
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("vk-scroll-top-sentinel");
  });

  it("shows a named button after the first viewport and hides it back at the top", async () => {
    vi.stubGlobal("IntersectionObserver", FakeObserver);
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => root.render(<ScrollTop label="Back to top" targetId="main-content" />));
    expect(host.querySelector("button")).toBeNull();
    const observer = observers[0];
    if (!observer) throw new Error("no observer");
    await act(async () =>
      observer.callback([
        { isIntersecting: false, boundingClientRect: { bottom: -10 } as DOMRectReadOnly },
      ]),
    );
    const button = host.querySelector("button");
    expect(button?.getAttribute("aria-label")).toBe("Back to top");
    expect(button?.getAttribute("type")).toBe("button");
    expect(button?.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    await act(async () =>
      observer.callback([
        { isIntersecting: true, boundingClientRect: { bottom: 500 } as DOMRectReadOnly },
      ]),
    );
    expect(host.querySelector("button")).toBeNull();
    await act(async () => root.unmount());
    expect(observer.disconnect).toHaveBeenCalled();
  });

  it("hands focus to main before it hides, so a focused button never drops focus to the body", async () => {
    vi.stubGlobal("IntersectionObserver", FakeObserver);
    const main = document.createElement("main");
    main.id = "main-content";
    main.tabIndex = -1;
    const host = document.createElement("div");
    document.body.append(main, host);
    const root = createRoot(host);
    await act(async () => root.render(<ScrollTop label="Back to top" targetId="main-content" />));
    const observer = observers[0];
    if (!observer) throw new Error("no observer");
    const at = (bottom: number, isIntersecting: boolean) =>
      act(async () =>
        observer.callback([{ isIntersecting, boundingClientRect: { bottom } as DOMRectReadOnly }]),
      );
    await at(-10, false);
    host.querySelector("button")?.focus();
    expect(document.activeElement?.tagName).toBe("BUTTON");
    await at(500, true);
    expect(host.querySelector("button")).toBeNull();
    expect(document.activeElement).toBe(main);
    await at(-10, false);
    await at(500, true);
    expect(document.activeElement).toBe(main);
    await act(async () => root.unmount());
  });
});

describe("the back-to-top control", () => {
  it("is named in every locale", () => {
    for (const catalog of [en, de, es, fr])
      expect(catalog.landing.fab.label.length).toBeGreaterThan(3);
    expect(new Set([en, de, es, fr].map((catalog) => catalog.landing.fab.label)).size).toBe(4);
  });

  it("is a 44px fixed target inside the safe area, with a control boundary that holds 3:1", () => {
    expect(css).toMatch(/--fab-size: 2\.75rem;/);
    const button = rule(".vk-scroll-top");
    expect(button).toContain("position: fixed;");
    expect(button).toContain("width: var(--fab-size);");
    expect(button).toContain("height: var(--fab-size);");
    expect(button).toContain("env(safe-area-inset-bottom)");
    expect(button).toContain("env(safe-area-inset-right)");
    expect(button).toContain("border: 1px solid var(--text-faint);");
  });

  it("keeps focused content clear of it and puts the sentinel one viewport down", () => {
    expect(rule("html:has(.vk-scroll-top-sentinel[data-active])")).toContain(
      "scroll-padding-bottom: var(--fab-clearance);",
    );
    expect(rule(".vk-scroll-top-sentinel")).toContain("height: 100vh;");
    expect(rule(".vk-home")).toContain("position: relative;");
  });

  it("enters with opacity and translate only, and only when motion is welcome", () => {
    const motion = css.slice(css.indexOf("@starting-style"), css.indexOf("@starting-style") + 200);
    expect(motion).toMatch(/opacity: 0;\s+translate: 0 var\(--motion-distance-md\);/);
    const before = css.slice(0, css.indexOf("@starting-style"));
    expect(before.lastIndexOf("@media (prefers-reduced-motion: no-preference)")).toBeGreaterThan(
      before.lastIndexOf(".vk-scroll-top-sentinel {"),
    );
  });

  it("transitions exactly opacity and translate, plus color and border color as the hover states", () => {
    const start = css.indexOf(
      "@media (prefers-reduced-motion: no-preference) {\n  .vk-scroll-top {",
    );
    const block = css.slice(start, css.indexOf("}", start));
    const properties = [...block.matchAll(/^\s+([a-z-]+) var\(--duration/gm)].map(
      ([, name]) => name,
    );
    expect(properties).toEqual(["opacity", "translate", "color", "border-color"]);
    expect(rule(".vk-scroll-top:hover")).toMatch(
      /border-color: var\(--accent\);\s+color: var\(--accent\);/,
    );
  });

  it("listens to no scroll event", () => {
    const source = readFileSync(join(process.cwd(), "components/landing/scroll-top.tsx"), "utf8");
    expect(source).not.toMatch(/addEventListener\(\s*["']scroll/);
    expect(source).toContain("IntersectionObserver");
  });
});
