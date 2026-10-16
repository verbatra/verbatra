// @vitest-environment jsdom

import { act, createRef, type RefObject } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { gsap } from "@/lib/gsap-scramble";
import {
  LATIN_SCRAMBLE_CHARS,
  SCRAMBLE_MOTION_QUERY,
  SCRAMBLE_ROW_DURATION_S,
  SCRAMBLE_STAGGER_S,
  type ScrambleController,
  type ScrambleRow,
  Scrambler,
  scrambleChars,
} from "./playground-scramble";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ROWS: ReadonlyArray<ScrambleRow> = [
  { lang: "de", from: "Settings", to: "Einstellungen" },
  { lang: "ja", from: "Settings", to: "設定" },
];

let motion = true;
let listeners = 0;
let mounted: { root: Root; host: HTMLElement } | undefined;

beforeEach(() => {
  motion = true;
  listeners = 0;
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      matches: query === SCRAMBLE_MOTION_QUERY ? motion : !motion,
      media: query,
      addEventListener: () => {
        listeners += 1;
      },
      removeEventListener: () => {
        listeners -= 1;
      },
      addListener: () => {
        listeners += 1;
      },
      removeListener: () => {
        listeners -= 1;
      },
    }),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  if (mounted) act(() => mounted?.root.unmount());
  mounted?.host.remove();
  mounted = undefined;
});

function unmount(): void {
  act(() => mounted?.root.unmount());
  mounted = undefined;
}

function trackTimelines(): Array<{ kill: ReturnType<typeof vi.fn>; timeline: gsap.core.Timeline }> {
  const created: Array<{ kill: ReturnType<typeof vi.fn>; timeline: gsap.core.Timeline }> = [];
  const timeline = gsap.timeline.bind(gsap);
  vi.spyOn(gsap, "timeline").mockImplementation((vars) => {
    const made = timeline(vars);
    const kill = vi.fn(made.kill.bind(made));
    made.kill = kill as unknown as typeof made.kill;
    created.push({ kill, timeline: made });
    return made;
  });
  return created;
}

function mount(): { controller: RefObject<ScrambleController | null>; targets: HTMLElement[] } {
  const host = document.createElement("ol");
  for (const row of ROWS) {
    const target = document.createElement("span");
    target.dataset.scramble = row.lang;
    target.setAttribute("aria-hidden", "true");
    host.append(target);
  }
  document.body.append(host);
  const scope = { current: host as HTMLElement | null };
  const controller = createRef<ScrambleController>();
  const root = createRoot(document.createElement("div"));
  mounted = { root, host };
  act(() => root.render(<Scrambler scope={scope} controller={controller} />));
  return { controller, targets: [...host.querySelectorAll<HTMLElement>("[data-scramble]")] };
}

describe("the playground scramble", () => {
  it("keeps the whole run between one and two seconds", () => {
    const total = SCRAMBLE_ROW_DURATION_S + SCRAMBLE_STAGGER_S * 3;
    expect(SCRAMBLE_STAGGER_S).toBe(0.12);
    expect(total).toBeGreaterThanOrEqual(1);
    expect(total).toBeLessThanOrEqual(2);
  });

  it("starts each row on its source text and settles on nothing once every row has its translation", async () => {
    const { controller, targets } = mount();
    const done = vi.fn();
    act(() => controller.current?.play(ROWS, done));
    expect(targets.map((target) => target.textContent)).toEqual(["Settings", "Settings"]);
    expect(done).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(done).toHaveBeenCalledTimes(1), { timeout: 4000 });
    expect(targets.map((target) => target.textContent)).toEqual(["", ""]);
  });

  it("settles at once, without touching the text, under reduced motion", () => {
    motion = false;
    const { controller, targets } = mount();
    const done = vi.fn();
    act(() => controller.current?.play(ROWS, done));
    expect(done).toHaveBeenCalledTimes(1);
    expect(targets.map((target) => target.textContent)).toEqual(["", ""]);
  });

  it("stops a running scramble when a new one starts, and when it unmounts", () => {
    const { controller, targets } = mount();
    const first = vi.fn();
    const second = vi.fn();
    act(() => controller.current?.play(ROWS, first));
    act(() => controller.current?.play(ROWS, second));
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
    expect(targets[0]?.textContent).toBe("Settings");
    unmount();
    expect(second).toHaveBeenCalledTimes(1);
    expect(targets.map((target) => target.textContent)).toEqual(["", ""]);
  });

  it("kills the running timeline and clears the rows on stop", () => {
    const timelines = trackTimelines();
    const { controller, targets } = mount();
    const done = vi.fn();
    act(() => controller.current?.play(ROWS, done));
    expect(timelines).toHaveLength(1);
    act(() => controller.current?.stop());
    expect(timelines[0]?.kill).toHaveBeenCalledTimes(1);
    expect(done).toHaveBeenCalledTimes(1);
    expect(targets.map((target) => target.textContent)).toEqual(["", ""]);
    act(() => controller.current?.stop());
    expect(done).toHaveBeenCalledTimes(1);
  });

  it("kills the previous timeline on every new play and the finished one when it ends", () => {
    const timelines = trackTimelines();
    const { controller } = mount();
    act(() => controller.current?.play(ROWS, () => undefined));
    act(() => controller.current?.play(ROWS, () => undefined));
    expect(timelines[0]?.kill).toHaveBeenCalledTimes(1);
    act(() => {
      timelines[1]?.timeline.progress(1);
    });
    expect(timelines[1]?.kill).toHaveBeenCalledTimes(1);
  });

  it("creates one matchMedia for its whole lifetime, however many presses, and reverts it on unmount", () => {
    const created: Array<ReturnType<typeof vi.fn>> = [];
    const matchMedia = gsap.matchMedia.bind(gsap);
    const spy = vi.spyOn(gsap, "matchMedia").mockImplementation((scope) => {
      const media = matchMedia(scope);
      const revert = vi.fn(media.revert.bind(media));
      media.revert = revert as unknown as typeof media.revert;
      created.push(revert);
      return media;
    });
    const { controller } = mount();
    const listening = listeners;
    for (let press = 0; press < 5; press++) {
      act(() => controller.current?.play(ROWS, () => undefined));
    }
    expect(spy).toHaveBeenCalledTimes(1);
    expect(listeners).toBe(listening);
    expect(created[0]).not.toHaveBeenCalled();
    unmount();
    expect(created[0]).toHaveBeenCalled();
  });

  it("writes the scramble into a text node, so markup in a translation stays inert text", () => {
    const innerHTML = Object.getOwnPropertyDescriptor(Element.prototype, "innerHTML");
    const setter = vi.fn();
    Object.defineProperty(Element.prototype, "innerHTML", {
      configurable: true,
      get: innerHTML?.get,
      set(value: string) {
        setter(value);
        innerHTML?.set?.call(this, value);
      },
    });
    try {
      const timelines = trackTimelines();
      const { controller, targets } = mount();
      const markup: ScrambleRow = { lang: "de", from: "Settings", to: "<b>x</b>&amp;" };
      act(() => controller.current?.play([markup], () => undefined));
      act(() => {
        timelines[0]?.timeline.progress(0.95);
      });
      expect(targets[0]?.childElementCount).toBe(0);
      expect(targets[0]?.childNodes[0]?.nodeType).toBe(Node.TEXT_NODE);
      expect(targets[0]?.textContent).toContain("b&gt;x");
      expect(setter).not.toHaveBeenCalled();
    } finally {
      if (innerHTML !== undefined) Object.defineProperty(Element.prototype, "innerHTML", innerHTML);
    }
  });
});

describe("the scramble characters", () => {
  it("scrambles a Latin translation with Latin letters", () => {
    expect(scrambleChars("Einstellungen")).toBe(LATIN_SCRAMBLE_CHARS);
    expect(scrambleChars("Verbatra")).toBe(LATIN_SCRAMBLE_CHARS);
  });

  it("scrambles a Japanese translation with its own characters, never a placeholder or a space", () => {
    expect(scrambleChars("設定")).toBe("設定");
    const chars = scrambleChars("おかえりなさい、{name}さん！");
    expect(chars).not.toMatch(/[a-z{}\s]/);
    expect([...chars]).toEqual([...new Set(chars)]);
    expect(chars).toContain("お");
  });
});
