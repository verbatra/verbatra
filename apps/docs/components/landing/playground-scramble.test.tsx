// @vitest-environment jsdom

import { act, createRef, type RefObject } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SCRAMBLE_MOTION_QUERY,
  SCRAMBLE_ROW_DURATION_S,
  SCRAMBLE_STAGGER_S,
  type ScrambleController,
  type ScrambleRow,
  Scrambler,
} from "./playground-scramble";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ROWS: ReadonlyArray<ScrambleRow> = [
  { lang: "de", from: "Settings", to: "Einstellungen" },
  { lang: "ja", from: "Settings", to: "設定" },
];

let motion = true;
let mounted: { root: Root; host: HTMLElement } | undefined;

beforeEach(() => {
  motion = true;
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      matches: query === SCRAMBLE_MOTION_QUERY ? motion : !motion,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
    }),
  });
});

afterEach(() => {
  if (mounted) act(() => mounted?.root.unmount());
  mounted?.host.remove();
  mounted = undefined;
});

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
    act(() => mounted?.root.unmount());
    mounted = undefined;
    expect(second).toHaveBeenCalledTimes(1);
    expect(targets.map((target) => target.textContent)).toEqual(["", ""]);
  });
});
