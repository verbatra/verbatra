// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextIntlClientProvider } from "next-intl";
import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  GATE_CHECK_COMMAND,
  GATE_CHECK_LINES,
  GATE_DE_CANDIDATE,
  GATE_DE_OLD,
  GATE_DOCS_PATH,
  GATE_MODEL,
  GATE_REFUSED_LINES,
  GATE_SOURCE,
  GATE_SOURCE_BEFORE,
  GATE_STATES,
  GATE_TRANSLATE_COMMAND,
} from "@/lib/gate-demo";
import {
  GATE_CLEAR_SVH,
  GATE_DROP_PX,
  GATE_HOLD_FLOOR_SVH,
  GATE_LINE_SHIFT_PX,
  GATE_PHASES,
  GATE_PIN_SVH,
  GATE_SLIDE_PX,
  GATE_SLIDE_SCALE,
  GATE_STAMP_SCALE,
  gateFrameFade,
  gateHoldMiddle,
  gatePercent,
} from "@/lib/gate-timeline";
import { docsGlobalCss, docsStylesheetRules, uiTokensCss } from "@/lib/stylesheet-rules";
import de from "@/messages/de.json";
import en from "@/messages/en.json";
import es from "@/messages/es.json";
import fr from "@/messages/fr.json";
import { cssBlock, literalColours } from "@/test-support/css-block";

const rendering = vi.hoisted(() => ({ locale: "en" }));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: ComponentProps<"a"> & { href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("next-intl/server", async () => {
  const { createTranslator } = await import("next-intl");
  const { default: en } = await import("@/messages/en.json");
  const { default: de } = await import("@/messages/de.json");
  const catalogs: Record<string, typeof en> = { en, de };
  return {
    getLocale: async () => rendering.locale,
    getTranslations: async (namespace: string) =>
      createTranslator({
        locale: rendering.locale,
        messages: catalogs[rendering.locale] ?? en,
        namespace: namespace as never,
      }),
  };
});

const { Gate } = await import("./gate");

let root: HTMLElement;

async function renderIn(locale: string): Promise<HTMLElement> {
  rendering.locale = locale;
  const element = document.createElement("div");
  element.innerHTML = renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={locale === "de" ? de : en}>
      {await Gate()}
    </NextIntlClientProvider>,
  );
  rendering.locale = "en";
  return element;
}

beforeAll(async () => {
  root = await renderIn("en");
});

function frames(): Element[] {
  return Array.from(root.querySelectorAll("figure.vk-gate-frame"));
}

describe("Gate", () => {
  it("is the named region #gate with one h2 and the integrity lead, and no eyebrow", () => {
    const section = root.querySelector("section#gate");
    expect(section?.getAttribute("aria-labelledby")).toBe("gate-heading");
    expect(root.querySelector("h2#gate-heading")?.textContent).toBe(
      "When the provider gets it wrong, nothing is written",
    );
    const lead = root.querySelector(".vk-section-head-lead");
    expect(lead?.textContent).toBe(
      `Every candidate passes an integrity gate before it reaches your file. ${GATE_DOCS_PATH.slice(1)}`,
    );
    expect(root.querySelector(".vk-eyebrow")).toBeNull();
    expect(root.querySelectorAll("h1, h2")).toHaveLength(1);
  });

  it("draws the three states in order, each a figure named by its caption", () => {
    expect(frames().map((frame) => frame.getAttribute("data-state"))).toEqual([...GATE_STATES]);
    for (const frame of frames()) {
      expect(frame.querySelectorAll(":scope > figcaption")).toHaveLength(1);
      expect(frame.hasAttribute("aria-labelledby")).toBe(false);
    }
  });

  it("holds the candidate once, the old file value in the two frames that show the file, and the source edit once", () => {
    const text = root.textContent ?? "";
    expect(text.split(GATE_DE_CANDIDATE)).toHaveLength(2);
    expect(text.split(GATE_DE_OLD)).toHaveLength(3);
    expect(text.split(GATE_SOURCE_BEFORE)).toHaveLength(2);
    const [candidate, refused, stale] = frames();
    expect(candidate?.textContent).toContain(GATE_DE_CANDIDATE);
    expect(candidate?.textContent).toContain(GATE_SOURCE_BEFORE);
    expect(candidate?.textContent).toContain(GATE_SOURCE);
    expect(candidate?.textContent).not.toContain(GATE_DE_OLD);
    for (const frame of [refused, stale]) {
      expect(frame?.textContent).toContain(GATE_DE_OLD);
      expect(frame?.textContent).not.toContain(GATE_DE_CANDIDATE);
    }
  });

  it("badges the candidate with the fixture's model, not a word its caption already says", () => {
    const [candidate] = frames();
    expect(candidate?.querySelector(".vk-lock-head .vk-lock-badge")?.textContent).toBe(GATE_MODEL);
    expect(candidate?.querySelector("figcaption b")?.textContent).not.toContain(GATE_MODEL);
  });

  it("prints exactly the lines the run test pins, after the command, and nothing else in the CLI blocks", () => {
    const [, refused, stale] = frames();
    const clis = (frame: Element | undefined) =>
      frame?.querySelector("pre[lang='en'] code")?.textContent ?? "";
    expect(clis(refused)).toBe([`$ ${GATE_TRANSLATE_COMMAND}`, ...GATE_REFUSED_LINES].join("\n"));
    expect(clis(stale)).toBe([`$ ${GATE_CHECK_COMMAND}`, ...GATE_CHECK_LINES].join("\n"));
    expect(stale?.textContent).toContain("exit 1");
  });

  it.each([
    ["en", en],
    ["de", de],
    ["es", es],
    ["fr", fr],
  ] as const)("promises no re-run in any %s caption, foot or lead", (locale, catalog) => {
    const PATTERNS = {
      en: /\b(re-?run|retr(y|ied)|next run|try again)\b/i,
      de: /(erneut|nochmal|noch einmal|wiederhol|n\u00e4chsten? (lauf|durchlauf))/i,
      es: /(otra vez|de nuevo|reintent|volver a|pr\u00f3xima ejecuci\u00f3n|siguiente ejecuci\u00f3n)/i,
      fr: /(r\u00e9essay|de nouveau|\u00e0 nouveau|relanc|prochaine ex\u00e9cution|r\u00e9ex\u00e9cut)/i,
    } as const;
    const { badge: _badge, ...candidate } = catalog.landing.gate.candidate as Record<
      string,
      string
    >;
    const text = JSON.stringify({ ...catalog.landing.gate, candidate });
    expect(text).not.toMatch(PATTERNS[locale]);
  });

  it("gives each frame one moving element, marked for the shared reveal, outside every CLI block", () => {
    for (const frame of frames()) {
      expect(frame.querySelectorAll("[data-reveal]")).toHaveLength(1);
      expect(frame.querySelector("pre[lang='en'] [data-reveal]")).toBeNull();
    }
    const stamp = root.querySelector(".vk-gate-stamp");
    expect(stamp?.textContent).toBe("not written");
    expect(stamp?.closest("[lang]")).toBeNull();
    expect(stamp?.closest("pre")).toBeNull();
  });

  it("marks the position with a three-segment marker, aria-hidden, no digits, the current one lit", () => {
    const markers = Array.from(root.querySelectorAll("figcaption .vk-gate-marker"));
    expect(markers).toHaveLength(3);
    markers.forEach((marker, index) => {
      expect(marker.getAttribute("aria-hidden")).toBe("true");
      expect(marker.textContent).toBe("");
      const lit = Array.from(marker.querySelectorAll("i")).map((segment) =>
        segment.hasAttribute("data-on"),
      );
      expect(lit).toEqual([0, 1, 2].map((segment) => segment === index));
    });
    const hidden = Array.from(root.querySelectorAll("[aria-hidden]"));
    expect(
      hidden.every(
        (node) =>
          node.classList.contains("vk-gate-marker") || node.classList.contains("vk-lock-sign"),
      ),
    ).toBe(true);
  });

  it("keeps anything focusable out of the frames, which stay in the tree while hidden", () => {
    for (const frame of frames())
      expect(
        frame.querySelector("a, button, input, select, textarea, summary, [tabindex]"),
      ).toBeNull();
  });

  it("keeps CLI text whole and in English on every locale, and the stamp in the page language", async () => {
    const german = await renderIn("de");
    for (const pre of german.querySelectorAll(
      "figure[data-state='refused'] pre[lang='en'], figure[data-state='stale'] pre[lang='en']",
    )) {
      expect(pre.getAttribute("lang")).toBe("en");
    }
    expect(german.querySelector("h2")?.textContent).not.toBe(root.querySelector("h2")?.textContent);
    const stamp = german.querySelector(".vk-gate-stamp");
    expect(stamp?.textContent).toBe(de.landing.gate.refused.stamp);
    expect(stamp?.closest("[lang]")).toBeNull();
  });

  it("links the translation safety page once, in the head beside the lead, never in a frame", () => {
    const links = Array.from(root.querySelectorAll("a"));
    expect(links.map((link) => link.getAttribute("href"))).toEqual([GATE_DOCS_PATH]);
    expect(links[0]?.closest(".vk-section-head-lead")).not.toBeNull();
    expect(links[0]?.closest("figure")).toBeNull();
  });
});

describe("the gate stylesheet", () => {
  const rules = docsStylesheetRules();
  const timelineRules = rules.filter((rule) =>
    (rule.declarations["animation-timeline"] ?? "").includes("--vk-gate"),
  );
  const keyframes = rules.filter((rule) => rule.media.includes("@keyframes vk-gate"));
  const FRAME_SETS = ["vk-gate-candidate", "vk-gate-refused", "vk-gate-stale"];

  it("scrubs only inside a supports test and the no-preference query, from 64rem wide and 42rem tall", () => {
    expect(timelineRules.length).toBeGreaterThan(0);
    for (const rule of timelineRules) {
      expect(rule.media, rule.selector).toContain("@supports (animation-timeline: view())");
      expect(rule.media, rule.selector).toContain("prefers-reduced-motion: no-preference");
      expect(rule.media, rule.selector).toContain("(min-width: 64rem)");
      expect(rule.media, rule.selector).toContain("(min-height: 42rem)");
      expect(rule.media, rule.selector).toMatch(/\(\s*scripting: enabled\s*\)/);
    }
  });

  const STATES = ["candidate", "refused", "stale"] as const;
  const declared = (selector: string, property: string): string | undefined =>
    rules.find((rule) => rule.selector === selector && rule.media.includes("@supports"))
      ?.declarations[property];
  const contain = (range: readonly [number, number] | null): string =>
    range === null ? "" : `contain ${gatePercent(range[0])} contain ${gatePercent(range[1])}`;
  const svhOf = (percent: string): number => (Number.parseFloat(percent) / 100) * GATE_PIN_SVH;
  const rangesOf = (value: string | undefined): Array<[number, number]> =>
    (value ?? "")
      .split(/,\s*(?=contain)/)
      .filter((part) => part !== "")
      .map((part) => {
        const [from = "", to = ""] = part.replace(/contain\s+/g, "").split(/\s+/);
        return [svhOf(from), svhOf(to)];
      });
  const caption = (state: string) => `.vk-gate-frame[data-state="${state}"] > .vk-lock-caption`;
  const cardOf = (state: string) => `.vk-gate-frame[data-state="${state}"] > .vk-gate-card`;
  const markerOf = (state: string) =>
    `.vk-gate-frame[data-state="${state}"] .vk-gate-marker i[data-on]::after`;

  it("pins one sticky stage as long as the schedule says, clipping the stage, with room for the slide and the halo", () => {
    const track = rules.find((rule) => rule.selector === ".vk-gate-track" && rule.media !== "");
    expect(GATE_PIN_SVH).toBe(150);
    expect(track?.declarations["--vk-gate-pin"]).toBe(`${GATE_PIN_SVH}svh`);
    expect(track?.declarations.height).toBe("calc(var(--vk-gate-pin) + var(--vk-gate-stage))");
    const pin = rules.find((rule) => rule.selector === ".vk-gate-pin" && rule.media !== "");
    expect(pin?.declarations.position).toBe("sticky");
    expect(declared(".vk-gate-stage", "overflow")).toBe("clip");
    expect(declared(".vk-gate-stage", "overflow-clip-margin")).toBe("6rem");
    expect(
      Number.parseFloat(declared(".vk-gate-stage", "overflow-clip-margin") ?? "0") * 16,
    ).toBeGreaterThanOrEqual(GATE_SLIDE_PX + 16);
    expect(declared(".vk-gate-pin", "overflow")).toBeUndefined();
    expect(declared(".vk-gate-track", "overflow")).toBeUndefined();
  });

  it("holds every state for at least the floor with nothing moving, and the last until the pin ends", () => {
    for (const [index, phases] of GATE_PHASES.entries()) {
      const [from, to] = phases.hold;
      expect(to - from, `hold ${index}`).toBeGreaterThanOrEqual(GATE_HOLD_FLOOR_SVH);
      expect(GATE_HOLD_FLOOR_SVH * 6.72).toBeGreaterThanOrEqual(220);
    }
    expect(GATE_PHASES.at(-1)?.hold[1]).toBe(GATE_PIN_SVH);
    for (const [index, state] of STATES.entries()) {
      const [from, to] = GATE_PHASES[index]?.hold ?? [0, 0];
      const moving = [
        ...rangesOf(declared(caption(state), "animation-range")),
        ...rangesOf(declared(cardOf(state), "animation-range")),
        ...rangesOf(declared(markerOf(state), "animation-range")),
      ];
      for (const [start, end] of moving) {
        expect(end <= from + 0.01 || start >= to - 0.01, `${state} ${start}-${end}`).toBe(true);
      }
    }
  });

  type Window = readonly [number, number] | null;
  const listOf = (items: ReadonlyArray<string | null>): string =>
    items.filter((item) => item !== null).join(", ");
  const expectSlide = (selector: string, kind: string, enter: Window, exit: Window): void => {
    expect(declared(selector, "animation-name"), selector).toBe(
      listOf([enter && `vk-gate-${kind}-in`, exit && `vk-gate-${kind}-out`]),
    );
    expect(declared(selector, "animation-range"), selector).toBe(
      listOf([enter && contain(enter), exit && contain(exit)]),
    );
    expect(declared(selector, "animation-fill-mode"), selector).toBe(
      listOf([enter && "backwards", exit && "forwards"]),
    );
    expect(declared(selector, "animation-timing-function"), selector).toBe(
      listOf([enter && "var(--ease-standard)", exit && "var(--ease-exit)"]),
    );
    expect(declared(selector, "animation-timeline"), selector).toBe("--vk-gate");
  };
  const keyframe = (name: string, stop: "from" | "to") =>
    keyframes.find((rule) => rule.media.endsWith(`@keyframes ${name}`) && rule.selector === stop)
      ?.declarations;

  it("runs each caption and card through the slide-in and the slide-out the schedule gives it", () => {
    for (const [index, state] of STATES.entries()) {
      const phases = GATE_PHASES[index];
      expectSlide(
        caption(state),
        "caption",
        phases?.enterCaption ?? null,
        phases?.exitCaption ?? null,
      );
      expectSlide(cardOf(state), "card", phases?.enterCard ?? null, phases?.exitCard ?? null);
    }
  });

  it("starts the card after the caption and ends it after, the same distance in both", () => {
    for (const phases of GATE_PHASES.slice(1)) {
      expect(phases.enterCard?.[0] ?? 0).toBeGreaterThan(phases.enterCaption?.[0] ?? 0);
      expect(phases.enterCard?.[1] ?? 0).toBeGreaterThan(phases.enterCaption?.[1] ?? 0);
    }
    expect(GATE_PHASES[0]?.exitCard?.[0]).toBeGreaterThan(GATE_PHASES[0]?.exitCaption?.[0] ?? 0);
    expect(keyframe("vk-gate-caption-in", "from")).toEqual({
      opacity: "0",
      transform: `translateX(${GATE_SLIDE_PX}px)`,
    });
    expect(keyframe("vk-gate-caption-out", "to")).toEqual({
      opacity: "0",
      transform: `translateX(-${GATE_SLIDE_PX}px)`,
    });
    expect(keyframe("vk-gate-card-in", "from")).toEqual({
      opacity: "0",
      transform: `translateX(${GATE_SLIDE_PX}px) scale(${GATE_SLIDE_SCALE})`,
    });
    expect(keyframe("vk-gate-card-out", "to")).toEqual({
      opacity: "0",
      transform: `translateX(-${GATE_SLIDE_PX}px) scale(${GATE_SLIDE_SCALE})`,
    });
    expect(keyframe("vk-gate-caption-in", "to")).toEqual({ opacity: "1", transform: "none" });
    expect(keyframe("vk-gate-card-out", "from")).toEqual({ opacity: "1", transform: "none" });
  });

  it("staggers the CLI lines of the last two frames, a line 1svh after the one before, the refused one last", () => {
    const lineRule = rules.find(
      (rule) => rule.selector === ".vk-gate-cli .vk-lock-line" && rule.media.includes("@supports"),
    );
    expect(lineRule?.declarations["animation-name"]).toBe("vk-gate-line");
    expect(lineRule?.declarations["animation-fill-mode"]).toBe("backwards");
    expect(lineRule?.declarations["animation-timeline"]).toBe("--vk-gate");
    expect(lineRule?.declarations["animation-timing-function"]).toBe("var(--ease-standard)");
    expect(lineRule?.declarations["animation-range"]).toBe(
      "contain var(--vk-line-start) contain calc(var(--vk-line-start) + var(--vk-lines-span))",
    );
    expect(lineRule?.declarations["--vk-line-start"]).toBe(
      "calc(var(--vk-lines-from) + var(--n, 0) * var(--vk-lines-step))",
    );
    for (const [index, state] of STATES.entries()) {
      const lines = GATE_PHASES[index]?.lines;
      const frame = rules.find(
        (rule) =>
          rule.selector === `.vk-gate-frame[data-state="${state}"]` &&
          rule.media.includes("@supports") &&
          "--vk-lines-from" in rule.declarations,
      );
      if (lines === null || lines === undefined) {
        expect(frame, state).toBeUndefined();
        continue;
      }
      expect(frame?.declarations["--vk-lines-from"]).toBe(gatePercent(lines.from));
      expect(frame?.declarations["--vk-lines-step"]).toBe(gatePercent(lines.step));
      expect(frame?.declarations["--vk-lines-span"]).toBe(gatePercent(lines.span));
      const rows = Array.from(
        root.querySelectorAll(`figure[data-state='${state}'] .vk-gate-cli .vk-lock-line`),
      ).map((line) => Number((line as HTMLElement).style.getPropertyValue("--n")));
      expect(rows.length).toBeGreaterThan(2);
      expect(new Set(rows).size).toBe(rows.length);
      expect(Math.min(...rows)).toBe(0);
      expect(Math.max(...rows)).toBe(rows.length - 1);
      const marked = root.querySelector(
        `figure[data-state='${state}'] .vk-gate-cli .vk-lock-line[data-mark='refused']`,
      ) as HTMLElement | null;
      if (marked !== null)
        expect(Number(marked.style.getPropertyValue("--n"))).toBe(rows.length - 1);
      const last = lines.from + (rows.length - 1) * lines.step + lines.span;
      expect(last).toBe(GATE_PHASES[index]?.element?.[0] ?? last);
    }
    expect(GATE_LINE_SHIFT_PX).toBe(24);
    expect(
      keyframes.find(
        (rule) => rule.media.endsWith("@keyframes vk-gate-line") && rule.selector === "from",
      )?.declarations,
    ).toEqual({ opacity: "0", transform: `translateX(${GATE_LINE_SHIFT_PX}px)` });
  });

  it("times the chip drop, the stamp, the exit badge and the marker fill from the schedule", () => {
    const range = (selector: string) => declared(selector, "animation-range");
    expect(range(".vk-gate-slot")).toBe(contain(GATE_PHASES[0]?.element ?? null));
    expect(range(".vk-gate-stamp")).toBe(contain(GATE_PHASES[1]?.element ?? null));
    expect(range(".vk-gate-exit")).toBe(contain(GATE_PHASES[2]?.element ?? null));
    for (const [index, state] of STATES.entries())
      expect(range(markerOf(state)), state).toBe(contain(GATE_PHASES[index]?.marker ?? null));
    const fill = rules.find(
      (rule) =>
        rule.selector === markerOf("candidate") ||
        rule.selector === ".vk-gate-marker i[data-on]::after",
    );
    expect(fill?.declarations["transform-origin"]).toBe("left");
    expect(fill?.declarations["animation-name"]).toBe("vk-gate-fill");
    expect(
      keyframes.find(
        (rule) => rule.media.endsWith("@keyframes vk-gate-fill") && rule.selector === "from",
      )?.declarations,
    ).toEqual({ transform: "scaleX(0)" });
    expect(
      keyframes.find(
        (rule) => rule.media.endsWith("@keyframes vk-gate-stamp") && rule.selector === "from",
      )?.declarations.transform,
    ).toBe(`scale(${GATE_STAMP_SCALE})`);
    expect(
      keyframes.find(
        (rule) => rule.media.endsWith("@keyframes vk-gate-drop") && rule.selector === "from",
      )?.declarations.transform,
    ).toBe(`translateY(-${GATE_DROP_PX}px)`);
  });

  it("keeps every element's range off the exact ends of the timeline", () => {
    const ranges = rules
      .filter(
        (rule) =>
          rule.media.includes("@supports") &&
          rule.declarations["animation-range"] !== undefined &&
          !rule.declarations["animation-range"].includes("var(") &&
          !rule.selector.startsWith(".vk-gate-frame {") &&
          rule.selector !== ".vk-gate-frame",
      )
      .flatMap((rule) => rangesOf(rule.declarations["animation-range"]));
    expect(ranges.length).toBeGreaterThan(10);
    for (const [from, to] of ranges) {
      expect(from).toBeGreaterThan(0.5);
      expect(to).toBeLessThan(GATE_PIN_SVH - 0.5);
    }
  });

  const stopsOf = (name: string, property: string) =>
    keyframes
      .filter((rule) => rule.media.endsWith(name))
      .flatMap((rule) =>
        rule.selector
          .split(/,\s*/)
          .map((offset) => [Number.parseFloat(offset), rule.declarations[property]] as const),
      )
      .sort((a, b) => a[0] - b[0]);
  const opacityAt = (name: string, at: number): number => {
    const stops = stopsOf(name, "opacity").map(([x, y]) => [x, Number(y)] as const);
    const after = stops.findIndex(([offset]) => offset >= at);
    if (after <= 0) return stops[Math.max(after, 0)]?.[1] ?? 0;
    const [x0, y0] = stops[after - 1] ?? [0, 0];
    const [x1, y1] = stops[after] ?? [0, 0];
    return x1 === x0 ? y1 : y0 + ((y1 - y0) * (at - x0)) / (x1 - x0);
  };
  const eventsAt = (name: string, at: number): string | undefined =>
    stopsOf(name, "pointer-events")
      .filter(([offset]) => offset <= at)
      .at(-1)?.[1];
  const percentOf = (svh: number): number => (svh / GATE_PIN_SVH) * 100;

  it("keeps two frames from ever showing at once and hands the pointer to the current frame only", () => {
    for (let at = 0; at <= 100; at += 0.02) {
      const visible = FRAME_SETS.filter((name) => opacityAt(name, at) > 0.1);
      expect(visible.length, `${at}%`).toBeLessThanOrEqual(1);
      for (const name of visible) expect(eventsAt(name, at), `${name} at ${at}`).toBe("auto");
    }
    for (const [index, name] of FRAME_SETS.entries()) {
      const mid = percentOf(gateHoldMiddle(index));
      expect(opacityAt(name, mid), name).toBe(1);
      for (const other of FRAME_SETS.filter((candidate) => candidate !== name))
        expect(eventsAt(other, mid), `${other} at the hold of ${name}`).toBe("none");
    }
  });

  it("has the outgoing frame at opacity 0 at least 1svh before the incoming one starts", () => {
    for (const index of [0, 1]) {
      const name = FRAME_SETS[index] ?? "";
      let lastVisible = 0;
      for (let at = 0; at <= 100; at += 0.01) if (opacityAt(name, at) > 0) lastVisible = at;
      const outgoingZero = ((lastVisible + 0.01) / 100) * GATE_PIN_SVH;
      const incomingStart = GATE_PHASES[index + 1]?.enterCaption?.[0] ?? 0;
      expect(incomingStart - outgoingZero, `frame ${index}`).toBeGreaterThanOrEqual(
        GATE_CLEAR_SVH - 0.05,
      );
    }
  });

  it("fades each frame in just before its first slide and out just after its last", () => {
    for (const [index, set] of FRAME_SETS.entries()) {
      const fade = gateFrameFade(index);
      if (fade.rise) {
        expect(opacityAt(set, percentOf(fade.rise[0]) - 0.01)).toBe(0);
        expect(opacityAt(set, percentOf(fade.rise[1]) + 0.01)).toBe(1);
      }
      if (fade.fall) {
        expect(opacityAt(set, percentOf(fade.fall[0]) - 0.01)).toBe(1);
        expect(opacityAt(set, percentOf(fade.fall[1]) + 0.01)).toBe(0);
      }
    }
  });

  it("animates opacity and transform only, plus the discrete pointer-events of a frame, never visibility", () => {
    expect(keyframes.length).toBeGreaterThan(0);
    for (const rule of keyframes) {
      const frame = FRAME_SETS.some((name) => rule.media.endsWith(name));
      const allowed = frame ? ["opacity", "pointer-events"] : ["opacity", "transform"];
      expect(Object.keys(rule.declarations).filter((name) => !allowed.includes(name))).toEqual([]);
    }
    const gate = rules.filter((rule) => rule.selector.includes("vk-gate"));
    for (const rule of gate) expect(rule.declarations.visibility, rule.selector).toBeUndefined();
  });

  it("owns an exit easing token and reads it, with the standard easing for entrances", () => {
    expect(uiTokensCss()).toContain("--ease-exit: cubic-bezier(0.4, 0, 1, 1);");
    const css = docsGlobalCss();
    expect(css.split("var(--ease-exit)").length - 1).toBeGreaterThanOrEqual(2);
  });

  it("holds the same layout in the stacked and the staged card, spanning the column grid", () => {
    expect(
      rules.some(
        (rule) =>
          rule.media.includes("@supports") &&
          ["height", "min-height", "aspect-ratio", "max-width"].some(
            (p) => p in rule.declarations,
          ) &&
          rule.selector.includes(".vk-gate-card"),
      ),
    ).toBe(false);
    expect(
      rules.find((r) => r.selector === ".vk-gate-card" && r.media === "")?.declarations[
        "max-width"
      ],
    ).toBeUndefined();
    const stacked = rules.find(
      (r) =>
        r.selector === ".vk-gate-frame > .vk-gate-card" && r.media === "@media (min-width: 64rem)",
    );
    expect(stacked?.declarations["grid-column"]).toBe("5 / span 8");
    const pinned = rules.find(
      (r) =>
        r.selector === ".vk-gate-frame" &&
        r.media.includes("@supports (animation-timeline: view())"),
    );
    expect(pinned?.declarations["grid-column"]).toBe("1 / span 8");
  });

  it("paints every failing badge in the danger colour, never the accent", () => {
    const rule = rules.find((r) => r.selector === ".vk-gate-fail" && r.media === "");
    expect(rule?.declarations.color).toBe("var(--text-danger)");
    expect(root.querySelectorAll(".vk-lock-badge.vk-gate-fail")).toHaveLength(2);
    const [candidate] = frames();
    expect(candidate?.querySelector(".vk-gate-fail")).toBeNull();
  });

  it("outlines the card and the refused line in forced colors and never uses a literal colour", () => {
    for (const selector of [".vk-gate-card", '.vk-lock-line[data-mark="refused"]'])
      expect(
        rules.some(
          (rule) =>
            rule.selector === selector &&
            rule.media.includes("forced-colors") &&
            rule.declarations.outline?.startsWith("2px solid Highlight"),
        ),
        selector,
      ).toBe(true);
    const css = readFileSync(join(process.cwd(), "app/global.css"), "utf8");
    const from = css.indexOf("\n.vk-gate-track {");
    expect(from).toBeGreaterThan(-1);
    const gate = css.slice(from);
    expect(gate.length).toBeGreaterThan(3000);
    expect(literalColours(gate)).toEqual([]);
    expect(cssBlock(css, "\n.vk-gate-track {", "\n.vk-gate-stage {").length).toBeGreaterThan(5);
  });

  it("lets the reveal offset yield to the scrub with a higher specificity than the hiding rule", () => {
    const yielding = rules.find(
      (rule) => rule.selector === "html[data-motion-ready] .vk-gate .vk-gate-track .vk-gate-moves",
    );
    expect(yielding?.declarations).toMatchObject({
      opacity: "1",
      translate: "none",
      transition: "none",
    });
  });

  it("never listens to scroll", () => {
    const source = readFileSync(join(import.meta.dirname, "gate.tsx"), "utf8");
    expect(source).not.toMatch(/addEventListener|"use client"|useEffect/);
  });
});
