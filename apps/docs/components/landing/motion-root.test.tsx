// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { docsStylesheetRules, rulesFor, uiTokensCss } from "@/lib/stylesheet-rules";
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
  Object.defineProperty(document.documentElement, "scrollHeight", {
    configurable: true,
    value: 10000,
  });
});

afterEach(() => {
  stop?.();
  stop = undefined;
  vi.unstubAllGlobals();
  Reflect.deleteProperty(document.documentElement, "scrollHeight");
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
    expect(FakeObserver.all).toHaveLength(2);
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

  it("observes without the bottom inset an element the inset could never reach at the end of the page", () => {
    const { below } = mount();
    const late = document.createElement("div");
    late.setAttribute("data-reveal", "2");
    document.body.append(late);
    place(late, 1950);
    Object.defineProperty(document.documentElement, "scrollHeight", {
      configurable: true,
      value: 2000,
    });
    place(below, 900);
    stop = startMotion();
    const [reveal, atEnd] = FakeObserver.all;
    expect(reveal?.observed.has(below)).toBe(true);
    expect(reveal?.observed.has(late)).toBe(false);
    expect(atEnd?.observed.has(late)).toBe(true);
    expect(atEnd?.options?.rootMargin).toBeUndefined();
    atEnd?.fire(late, true);
    expect(late.hasAttribute("data-revealed")).toBe(true);
  });

  it("routes an element by where its hidden translation puts it once the root is ready", () => {
    mount();
    const late = document.createElement("div");
    late.setAttribute("data-reveal", "2");
    document.body.append(late);
    late.getBoundingClientRect = () =>
      ({
        top: document.documentElement.hasAttribute("data-motion-ready") ? 1931 : 1915,
      }) as DOMRect;
    Object.defineProperty(document.documentElement, "scrollHeight", {
      configurable: true,
      value: 2000,
    });
    stop = startMotion();
    const [reveal, atEnd] = FakeObserver.all;
    expect(reveal?.observed.has(late)).toBe(false);
    expect(atEnd?.observed.has(late)).toBe(true);
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
  const css = `${uiTokensCss()}\n${readFileSync(join(import.meta.dirname, "../../app/global.css"), "utf8")}`;
  const all = docsStylesheetRules();
  const reveal = all.filter((rule) => rule.selector.includes("[data-reveal]"));

  it("hides a reveal only under no-preference and only after the script marked the root ready", () => {
    const hiding = reveal.filter((rule) => rule.declarations.opacity === "0");
    expect(hiding.map((rule) => rule.selector)).toEqual([
      "html[data-motion-ready] [data-reveal]:not([data-revealed])",
    ]);
    for (const rule of hiding) {
      expect(rule.media).toContain("prefers-reduced-motion: no-preference");
      expect(rule.media).toContain("@media screen and");
    }
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

  it("keeps the staged lock demo from 64rem free of a hidden reveal, with no second hiding rule", () => {
    const staged = all.find(
      (rule) => rule.selector === "html[data-motion-ready] .vk-lock .vk-lock-card[data-reveal]",
    );
    expect(staged?.media).toContain("(min-width: 64rem)");
    expect(staged?.media).toContain("prefers-reduced-motion: no-preference");
    expect(staged?.declarations).toEqual({ opacity: "1", translate: "none" });
  });

  it("leaves the faq items out of the reveal below 40rem, where every reveal would be the same fade-up", () => {
    const rule = all.find(
      (candidate) =>
        candidate.selector ===
        "html[data-motion-ready] .vk-faq-item[data-reveal]:not([data-revealed])",
    );
    expect(rule?.media).toContain("(max-width: 39.99rem)");
    expect(rule?.media).toContain("prefers-reduced-motion: no-preference");
    expect(rule?.declarations).toEqual({ opacity: "1", translate: "none" });
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

  const SCROLL_FADES: ReadonlyArray<string> = [
    '.vk-edge-fade, .vk-docs-tabs > [role="tablist"]',
    ".vk-edge-fade.vk-home-tabs-scroller",
  ];

  const timelineRules = all.filter((rule) => "animation-timeline" in rule.declarations);

  it("declares an animation timeline only in the two scroll-fade rules or inside a view-timeline supports test and the no-preference query", () => {
    expect(timelineRules.length).toBeGreaterThan(SCROLL_FADES.length);
    const fades = timelineRules.filter((rule) => SCROLL_FADES.includes(rule.selector));
    expect(fades.map((rule) => rule.selector).sort()).toEqual([...SCROLL_FADES].sort());
    for (const rule of fades) {
      expect(rule.media, rule.selector).toContain("@supports (animation-timeline: scroll())");
      expect(rule.declarations["animation-timeline"], rule.selector).toMatch(
        /^scroll\(self inline\)(, scroll\(self inline\))?$/,
      );
    }
    for (const rule of timelineRules.filter((r) => !SCROLL_FADES.includes(r.selector))) {
      expect(rule.media, rule.selector).toMatch(/@supports \(animation-timeline: view\(\)\)/);
      expect(rule.media, rule.selector).toContain("prefers-reduced-motion: no-preference");
    }
  });

  it("animates only opacity and transform in every keyframe set a scrubbed rule names, and a frame's discrete pointer-events", () => {
    const names = new Set(
      all
        .filter((rule) => rule.media.includes("@supports (animation-timeline: view())"))
        .flatMap((rule) => (rule.declarations["animation-name"] ?? "").split(/,\s*/))
        .filter((name) => name !== ""),
    );
    expect(names.size).toBeGreaterThan(3);
    for (const name of names) {
      const sets = all.filter((rule) => rule.media.endsWith(`@keyframes ${name}`));
      expect(sets.length, name).toBeGreaterThan(0);
      const frame = /^vk-gate-(candidate|refused|stale)$/.test(name);
      const allowed = frame
        ? ["opacity", "pointer-events", "animation-timing-function"]
        : ["opacity", "transform"];
      for (const rule of sets)
        expect(
          Object.keys(rule.declarations).filter((property) => !allowed.includes(property)),
          name,
        ).toEqual([]);
    }
  });

  it("never animates the hero on load, whose h1 is the largest paint", () => {
    const moving = all
      .filter((rule) => "animation" in rule.declarations && rule.declarations.animation !== "none")
      .map((rule) => rule.selector);
    expect(moving.some((selector) => selector.includes("vk-banner"))).toBe(false);
  });
});
