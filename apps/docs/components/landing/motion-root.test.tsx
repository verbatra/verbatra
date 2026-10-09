// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { docsStylesheetRules, rulesFor } from "@/lib/stylesheet-rules";
import { isPastHero, PRESENCE_MARGIN, startMotion } from "./motion-root";

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
  fire(target: Element, isIntersecting: boolean, bottom = 100): void {
    this.callback([
      { target, isIntersecting, boundingClientRect: { bottom } } as IntersectionObserverEntry,
    ]);
  }
}

function place(element: HTMLElement, top: number): void {
  element.getBoundingClientRect = () => ({ top }) as DOMRect;
}

function mount(): { above: HTMLElement; below: HTMLElement; hero: HTMLElement; band: HTMLElement } {
  document.body.innerHTML = `
    <section data-presence="hero"></section>
    <section data-presence="marquee"></section>
    <section data-presence="final-cta"></section>
    <h2 data-reveal="0" id="above"></h2>
    <p data-reveal="1" id="below"></p>`;
  const get = (selector: string) => document.querySelector<HTMLElement>(selector) as HTMLElement;
  const above = get("#above");
  const below = get("#below");
  place(above, 100);
  place(below, 5000);
  return {
    above,
    below,
    hero: get('[data-presence="hero"]'),
    band: get('[data-presence="marquee"]'),
  };
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

  it("shows the header call to action only once the hero has scrolled above the viewport", () => {
    const { hero } = mount();
    stop = startMotion();
    const presence = FakeObserver.all[1];
    const root = document.documentElement;
    presence?.fire(hero, false, -10);
    expect(root.hasAttribute("data-past-hero")).toBe(true);
    presence?.fire(hero, true, 300);
    expect(root.hasAttribute("data-past-hero")).toBe(false);
  });

  it("hides the header call to action again while the final call to action is on screen", () => {
    mount();
    stop = startMotion();
    const final = document.querySelector('[data-presence="final-cta"]') as HTMLElement;
    const presence = FakeObserver.all[1];
    presence?.fire(final, true);
    expect(document.documentElement.hasAttribute("data-final-cta")).toBe(true);
    presence?.fire(final, false);
    expect(document.documentElement.hasAttribute("data-final-cta")).toBe(false);
  });

  it("stops the marquee while it is off screen", () => {
    const { band } = mount();
    stop = startMotion();
    const presence = FakeObserver.all[1];
    presence?.fire(band, false);
    expect(band.hasAttribute("data-offscreen")).toBe(true);
    presence?.fire(band, true);
    expect(band.hasAttribute("data-offscreen")).toBe(false);
  });

  it("leaves no motion state behind when the page unmounts", () => {
    const { hero } = mount();
    stop = startMotion();
    FakeObserver.all[1]?.fire(hero, false, -10);
    stop();
    stop = undefined;
    expect(document.documentElement.hasAttribute("data-motion-ready")).toBe(false);
    expect(document.documentElement.hasAttribute("data-past-hero")).toBe(false);
    for (const observer of FakeObserver.all) expect(observer.observed.size).toBe(0);
  });
});

describe("isPastHero", () => {
  it("is true only when the hero left through the top of the viewport", () => {
    const rect = (bottom: number) => ({ bottom }) as DOMRect;
    expect(isPastHero({ isIntersecting: false, boundingClientRect: rect(-1) })).toBe(true);
    expect(isPastHero({ isIntersecting: false, boundingClientRect: rect(900) })).toBe(false);
    expect(isPastHero({ isIntersecting: true, boundingClientRect: rect(10) })).toBe(false);
  });

  it("measures the top edge from the observer's root, which the sticky header and nav cover", () => {
    const rect = (bottom: number) => ({ bottom }) as DOMRect;
    const rootBounds = { top: 112 } as DOMRectReadOnly;
    expect(isPastHero({ isIntersecting: false, boundingClientRect: rect(100), rootBounds })).toBe(
      true,
    );
    expect(isPastHero({ isIntersecting: false, boundingClientRect: rect(500), rootBounds })).toBe(
      false,
    );
  });
});

describe("the landing section nav", () => {
  function mountNav(): { links: HTMLAnchorElement[]; sections: HTMLElement[] } {
    document.body.innerHTML = `
      <section data-presence="hero"></section>
      <nav>
        <a href="#showcase" data-nav-link>Demo</a>
        <a href="#how" data-nav-link>How</a>
        <a href="#faq" data-nav-link>FAQ</a>
      </nav>
      <section id="showcase"></section>
      <section id="how"></section>
      <section id="faq"></section>`;
    return {
      links: [...document.querySelectorAll<HTMLAnchorElement>("[data-nav-link]")],
      sections: [...document.querySelectorAll<HTMLElement>("section[id]")],
    };
  }

  const current = (links: HTMLAnchorElement[]) =>
    links.map((link) => link.getAttribute("aria-current"));

  it("watches the linked sections on the existing presence observer, below the header and nav", () => {
    const { sections } = mountNav();
    stop = startMotion();
    expect(FakeObserver.all).toHaveLength(2);
    const presence = FakeObserver.all[1];
    expect(presence?.options?.rootMargin).toBe(PRESENCE_MARGIN);
    for (const section of sections) expect(presence?.observed.has(section)).toBe(true);
  });

  it("marks the first linked section still in view as current, and only that one", () => {
    const { links, sections } = mountNav();
    stop = startMotion();
    const presence = FakeObserver.all[1];
    const [showcase, how, faq] = sections;
    expect(current(links)).toEqual([null, null, null]);
    presence?.fire(showcase as HTMLElement, true);
    presence?.fire(how as HTMLElement, true);
    expect(current(links)).toEqual(["true", null, null]);
    presence?.fire(showcase as HTMLElement, false);
    expect(current(links)).toEqual([null, "true", null]);
    presence?.fire(how as HTMLElement, false);
    presence?.fire(faq as HTMLElement, true);
    expect(current(links)).toEqual([null, null, "true"]);
    expect(faq?.hasAttribute("data-offscreen")).toBe(false);
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
        "opacity var(--duration-reveal) var(--ease-out) var(--reveal-delay), translate var(--duration-reveal) var(--ease-out) var(--reveal-delay)",
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
      "--ease-in-out",
      "--duration-reveal: 560ms",
      "--duration-demo: 900ms",
      "--reveal-distance: 16px",
      "--reveal-stagger: 70ms",
      "--reveal-delay-max: 350ms",
    ]) {
      expect(css).toContain(token);
    }
    expect(css).toContain("--reveal-distance: 12px");
    expect(rulesFor(all, "[data-reveal]")[0]?.declarations["--reveal-delay"]).toBe(
      "min( calc(var(--reveal-index, 0) * var(--reveal-stagger)), var(--reveal-delay-max) )",
    );
  });

  it("rises only the hero command panel on load, never the h1", () => {
    const moving = all
      .filter((rule) => rule.media.includes("no-preference") && "animation" in rule.declarations)
      .map((rule) => rule.selector);
    expect(moving.some((selector) => selector.includes("vk-hero-title"))).toBe(false);
    expect(moving.filter((selector) => selector.includes("vk-hero"))).toEqual([".vk-hero-panel"]);
  });

  it("dims only the bar of an upcoming How step, never its text", () => {
    const steps = all.filter((rule) => rule.selector.includes("vk-how-step"));
    for (const rule of steps) expect(rule.declarations.opacity).toBeUndefined();
    const upcoming = steps.filter((rule) => rule.selector.includes('[data-state="upcoming"]'));
    expect(upcoming.map((rule) => rule.selector)).toEqual([
      'html[data-motion-ready] .vk-how-step[data-state="upcoming"]::before',
    ]);
  });
});
