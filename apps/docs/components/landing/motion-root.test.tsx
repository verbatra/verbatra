// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { docsStylesheetRules, rulesFor } from "@/lib/stylesheet-rules";
import { startMotion } from "./motion-root";

type Callback = (entries: IntersectionObserverEntry[]) => void;

class FakeObserver {
  static all: FakeObserver[] = [];
  readonly observed = new Set<Element>();
  readonly unobserved: Element[] = [];
  constructor(
    readonly callback: Callback,
    readonly options?: IntersectionObserverInit,
  ) {
    FakeObserver.all.push(this);
  }
  observe(element: Element): void {
    this.observed.add(element);
  }
  unobserve(element: Element): void {
    this.observed.delete(element);
    this.unobserved.push(element);
  }
  disconnect(): void {
    this.observed.clear();
  }
  fire(target: Element, isIntersecting: boolean): void {
    this.callback([{ target, isIntersecting } as IntersectionObserverEntry]);
  }
}

function place(element: HTMLElement, top: number): void {
  element.getBoundingClientRect = () => ({ top }) as DOMRect;
}

function mount(): { above: HTMLElement; below: HTMLElement } {
  document.body.innerHTML = `
    <div data-reveal="2" id="above"></div>
    <div data-reveal="3" id="below"></div>`;
  const get = (selector: string) => document.querySelector<HTMLElement>(selector) as HTMLElement;
  const above = get("#above");
  const below = get("#below");
  place(above, 100);
  place(below, 5000);
  return { above, below };
}

let stop: (() => void) | undefined;

beforeEach(() => {
  FakeObserver.all = [];
  vi.stubGlobal("IntersectionObserver", FakeObserver);
  Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });
});

afterEach(() => {
  stop?.();
  stop = undefined;
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("startMotion", () => {
  it("marks the root ready and shows what is already on screen without animating it", () => {
    const { above, below } = mount();
    stop = startMotion();
    expect(document.documentElement.hasAttribute("data-motion-ready")).toBe(true);
    expect(above.hasAttribute("data-revealed")).toBe(true);
    expect(below.hasAttribute("data-revealed")).toBe(false);
    const [reveal] = FakeObserver.all;
    expect(reveal?.observed.has(above)).toBe(false);
    expect(reveal?.observed.has(below)).toBe(true);
  });

  it("runs one shared observer for every reveal and reveals each element once", () => {
    const { below } = mount();
    stop = startMotion();
    expect(FakeObserver.all).toHaveLength(1);
    const [reveal] = FakeObserver.all;
    reveal?.fire(below, false);
    expect(below.hasAttribute("data-revealed")).toBe(false);
    reveal?.fire(below, true);
    expect(below.hasAttribute("data-revealed")).toBe(true);
    expect(reveal?.unobserved).toEqual([below]);
    reveal?.fire(below, false);
    expect(below.hasAttribute("data-revealed")).toBe(true);
    expect(reveal?.options?.rootMargin).toBe("0px 0px -10% 0px");
  });

  it("leaves no motion state behind when the page unmounts", () => {
    mount();
    stop = startMotion();
    stop();
    stop = undefined;
    expect(document.documentElement.hasAttribute("data-motion-ready")).toBe(false);
    for (const observer of FakeObserver.all) expect(observer.observed.size).toBe(0);
  });

  it("never listens to scroll", () => {
    const source = readFileSync(join(import.meta.dirname, "motion-root.tsx"), "utf8");
    expect(source).not.toMatch(/addEventListener\(\s*["']scroll/);
    expect(source).not.toMatch(/onscroll/i);
  });
});

describe("the motion stylesheet", () => {
  const css = readFileSync(join(import.meta.dirname, "../../app/global.css"), "utf8");
  const all = docsStylesheetRules();
  const reveal = all.filter((rule) => rule.selector.includes("[data-reveal]"));

  it("hides a reveal only under no-preference and only after the script marked the root ready", () => {
    const hiding = reveal.filter((rule) => rule.declarations.opacity === "0");
    expect(hiding.map((rule) => rule.selector)).toEqual([
      "html[data-motion-ready] [data-reveal]:not([data-revealed])",
    ]);
    for (const rule of hiding)
      expect(rule.media).toContain("prefers-reduced-motion: no-preference");
    for (const rule of reveal.filter((r) => !r.media)) {
      for (const property of ["opacity", "translate", "visibility", "display"]) {
        expect(rule.declarations[property]).toBeUndefined();
      }
    }
  });

  it("animates only the reveal itself: hiding is instant", () => {
    const moving = reveal.filter((rule) => "transition" in rule.declarations);
    expect(moving.map((rule) => [rule.selector, rule.declarations.transition])).toEqual([
      [
        "html[data-motion-ready] [data-reveal][data-revealed]",
        "opacity var(--duration-slow) var(--ease-standard) var(--reveal-delay), translate var(--duration-slow) var(--ease-standard) var(--reveal-delay)",
      ],
      ["html[data-motion-ready] [data-reveal]:focus-within", "none"],
    ]);
  });

  it("shows an unrevealed block at once when focus moves into it", () => {
    const [focus] = rulesFor(all, "html[data-motion-ready] [data-reveal]:focus-within");
    expect(focus?.declarations).toEqual({ opacity: "1", translate: "none", transition: "none" });
    const hide = all.findIndex((rule) => rule.selector.endsWith(":not([data-revealed])"));
    expect(all.indexOf(focus as (typeof all)[number])).toBeGreaterThan(hide);
  });

  it("caps the stagger at the maximum delay and declares the motion tokens on :root", () => {
    for (const token of [
      "--duration-slow: 560ms",
      "--ease-standard: cubic-bezier(0.22, 1, 0.36, 1)",
      "--reveal-distance: var(--motion-distance-lg)",
      "--motion-distance-lg: 16px",
      "--reveal-stagger: 70ms",
      "--reveal-delay-max: 350ms",
    ]) {
      expect(css).toContain(token);
    }
    expect(css).toContain("--reveal-distance: var(--motion-distance-md)");
    expect(css).not.toMatch(/--duration-reveal|--ease-out\b/);
    for (const token of css.matchAll(/^\s+(--(?:duration|ease|motion-distance)-[a-z-]+):/gm)) {
      const uses = css.split(`var(${token[1]})`).length - 1;
      expect(uses, token[1]).toBeGreaterThan(0);
    }
    expect(rulesFor(all, "[data-reveal]")[0]?.declarations["--reveal-delay"]).toBe(
      "min( calc(var(--reveal-index, 0) * var(--reveal-stagger)), var(--reveal-delay-max) )",
    );
  });

  it("never animates the hero on load, whose h1 is the largest paint", () => {
    const moving = all
      .filter((rule) => "animation" in rule.declarations && rule.declarations.animation !== "none")
      .map((rule) => rule.selector);
    expect(moving.some((selector) => selector.includes("vk-banner"))).toBe(false);
  });
});
