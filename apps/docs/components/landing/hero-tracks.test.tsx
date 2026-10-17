// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LANDING_TRACK_IDS, LANDING_TRACKS } from "@/lib/landing-tracks";
import {
  HERO_TRACKS_ID,
  HeroTracks,
  type HeroTrackView,
  stepDelay,
  TYPE_CHAR_MS,
  TYPE_COMMAND_PAUSE_MS,
  TYPE_LINE_MS,
  trackStepCount,
} from "./hero-tracks";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const VIEWS: ReadonlyArray<HeroTrackView> = LANDING_TRACK_IDS.map((id) => {
  const track = LANDING_TRACKS[id];
  return {
    id,
    tab: id,
    summary: `${id} summary`,
    link: `${id} docs`,
    href: track.docsPath,
    title: track.terminalTitle,
    commands: track.commands,
    result: track.result,
    files: track.files,
    exit:
      track.exitCode === null ? null : { code: track.exitCode, label: `exit ${track.exitCode}` },
  };
});

let reduced = false;
let mounted: { root: Root; host: HTMLElement } | undefined;

beforeEach(() => {
  reduced = false;
  vi.useFakeTimers();
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      matches: query === "(prefers-reduced-motion: reduce)" ? reduced : false,
      media: query,
    }),
  });
});

afterEach(() => {
  if (mounted) act(() => mounted?.root.unmount());
  mounted?.host.remove();
  mounted = undefined;
  vi.useRealTimers();
});

function mount(): HTMLElement {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(<HeroTracks tracks={VIEWS} label="Pick a workflow" />));
  mounted = { root, host };
  return host;
}

function run(ms: number): void {
  for (let elapsed = 0; elapsed < ms; elapsed += TYPE_CHAR_MS) {
    act(() => vi.advanceTimersByTime(TYPE_CHAR_MS));
  }
}

function tabs(host: HTMLElement): HTMLButtonElement[] {
  return Array.from(host.querySelectorAll<HTMLButtonElement>("[role='tab']"));
}

function press(target: Element, key: string): void {
  act(() => {
    target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  });
}

function selected(host: HTMLElement): string | undefined {
  return tabs(host)
    .find((tab) => tab.getAttribute("aria-selected") === "true")
    ?.id.replace(`${HERO_TRACKS_ID}-tab-`, "");
}

function panel(host: HTMLElement, id: string): HTMLElement | null {
  return host.querySelector(`#${HERO_TRACKS_ID}-panel-${id}`);
}

function pending(host: HTMLElement, id: string): number {
  return panel(host, id)?.querySelectorAll("[data-state='pending']").length ?? 0;
}

describe("HeroTracks keyboard", () => {
  it("moves selection and focus with the arrow keys, wrapping, and with Home and End", () => {
    const host = mount();
    tabs(host)[0]?.focus();
    press(tabs(host)[0] as Element, "ArrowRight");
    expect(selected(host)).toBe("agents");
    expect(document.activeElement).toBe(tabs(host)[1]);
    press(tabs(host)[1] as Element, "End");
    expect(selected(host)).toBe("ci");
    press(tabs(host)[2] as Element, "ArrowRight");
    expect(selected(host)).toBe("translate");
    press(tabs(host)[0] as Element, "ArrowLeft");
    expect(selected(host)).toBe("ci");
    press(tabs(host)[2] as Element, "Home");
    expect(selected(host)).toBe("translate");
    expect(tabs(host).map((tab) => tab.tabIndex)).toEqual([0, -1, -1]);
  });

  it("opens the chosen panel and makes the others inert", () => {
    const host = mount();
    act(() => tabs(host)[2]?.click());
    expect(panel(host, "ci")?.dataset.active).toBe("true");
    expect(panel(host, "ci")?.hasAttribute("inert")).toBe(false);
    for (const id of ["translate", "agents"]) {
      expect(panel(host, id)?.dataset.active).toBe("false");
      expect(panel(host, id)?.hasAttribute("inert")).toBe(true);
    }
  });
});

describe("HeroTracks typing", () => {
  it("hydrates the default track in its final state and types nothing on load", () => {
    const host = mount();
    expect(host.querySelectorAll("[data-state='pending'], .vk-track-typed")).toHaveLength(0);
    run(5000);
    expect(host.querySelectorAll("[data-state='pending'], .vk-track-typed")).toHaveLength(0);
  });

  it("types the command on a switch, then shows the result lines, then settles", () => {
    const host = mount();
    act(() => tabs(host)[2]?.click());
    const ci = LANDING_TRACKS.ci;
    expect(pending(host, "ci")).toBe(ci.result.length + 1);
    run(TYPE_CHAR_MS * 10);
    const typed = panel(host, "ci")?.querySelector(".vk-track-typed");
    expect(typed?.getAttribute("aria-hidden")).toBe("true");
    expect(ci.commands[0]?.startsWith(typed?.textContent ?? "-")).toBe(true);
    expect(typed?.textContent?.length).toBeGreaterThan(0);
    expect(panel(host, "ci")?.querySelector(".vk-track-command code")?.textContent).toBe(
      ci.commands[0],
    );
    run(10_000);
    expect(pending(host, "ci")).toBe(0);
    expect(host.querySelector(".vk-track-typed")).toBeNull();
    expect(host.querySelector(".vk-tracks")?.hasAttribute("data-typing")).toBe(false);
  });

  it("shows the final state at once under reduced motion", () => {
    reduced = true;
    const host = mount();
    act(() => tabs(host)[1]?.click());
    expect(host.querySelectorAll("[data-state='pending'], .vk-track-typed")).toHaveLength(0);
    expect(host.querySelector(".vk-tracks")?.hasAttribute("data-typing")).toBe(false);
  });

  it("restarts the run when another track is chosen mid-way", () => {
    const host = mount();
    act(() => tabs(host)[2]?.click());
    run(TYPE_CHAR_MS * 5);
    act(() => tabs(host)[1]?.click());
    expect(pending(host, "agents")).toBe(LANDING_TRACKS.agents.files.length);
    expect(
      panel(host, "agents")?.querySelector(".vk-track-command")?.getAttribute("data-state"),
    ).toBe("typing");
    expect(pending(host, "ci")).toBe(0);
  });
});

describe("the typing timeline", () => {
  const translate = VIEWS[0] as HeroTrackView;

  it("takes one step per command character and one per result line", () => {
    const characters = translate.commands.join("").length;
    expect(trackStepCount(translate)).toBe(characters + translate.result.length);
  });

  it("pauses after each command and spaces the result lines evenly", () => {
    const first = translate.commands[0]?.length ?? 0;
    expect(stepDelay(translate, 0)).toBe(TYPE_CHAR_MS);
    expect(stepDelay(translate, first - 1)).toBe(TYPE_COMMAND_PAUSE_MS);
    expect(stepDelay(translate, translate.commands.join("").length)).toBe(TYPE_LINE_MS);
  });
});
