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
  GATE_TARGET_EXCERPT,
  GATE_TRANSLATE_COMMAND,
} from "@/lib/gate-demo";
import {
  GATE_ACCENT_MS,
  GATE_CUT_LEAD_SVH,
  GATE_CUTS,
  GATE_DROP_PX,
  GATE_ENTER_DELAY_MS,
  GATE_ENTER_MS,
  GATE_EXIT_MS,
  GATE_FADE_EXPONENT,
  GATE_HANDOFF_CEILING_MS,
  GATE_LANDING_OFFSET_PX,
  GATE_MARKER_MIN_PX,
  GATE_PAGE_STEP_MARGIN_SVH,
  GATE_PAGE_STEP_MAX_SVH,
  GATE_PIN_SVH,
  GATE_REVERSAL_SETTLE_MS,
  GATE_SLIDE_PX,
  GATE_SLIDE_SCALE,
  GATE_SLIDE_WIDE_PX,
  GATE_SLIDE_WIDE_REM,
  GATE_STAMP_SCALE,
  GATE_STEP_MS,
  gateMarkerRange,
  gatePercent,
  gateStateAt,
  gateStateRange,
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

  it("excerpts the German file once per frame that shows it, as the constant the markdown twin prints", () => {
    const [, refused, stale] = frames();
    for (const frame of [refused, stale]) {
      const excerpt = frame?.querySelectorAll("pre[lang='en'] code")[1]?.textContent;
      expect(excerpt).toBe(GATE_TARGET_EXCERPT.map((line) => line.trimStart()).join("\n"));
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
    const { foot, ...stale } = catalog.landing.gate.stale;
    expect(foot.length).toBeGreaterThan(0);
    expect(JSON.stringify({ ...catalog.landing.gate, stale })).not.toMatch(PATTERNS[locale]);
  });

  it.each([
    ["en", en, 92, /retried/i],
    ["de", de, 114, /(erneut|wieder)/i],
    ["es", es, 109, /reintent/i],
    ["fr", fr, 118, /(r\u00e9essay|relanc|nouveau)/i],
  ] as const)(
    "names the retry in the %s stale foot, within its previous length, and never promises the retry succeeds",
    (_locale, catalog, previousLength, retry) => {
      const { foot } = catalog.landing.gate.stale;
      expect(foot).toMatch(retry);
      expect(foot.length).toBeLessThanOrEqual(previousLength);
      expect(foot).not.toMatch(
        /(succe|gelingt|funciona|r\u00e9ussi|\bfix(ed|es)?\b|behoben|corrige|corrig)/i,
      );
    },
  );

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

  it("draws one progress marker in the pin, outside every frame: aria-hidden, no digits, one segment per state", () => {
    const markers = Array.from(root.querySelectorAll(".vk-gate-progress"));
    expect(markers).toHaveLength(1);
    const [marker] = markers;
    expect(marker?.getAttribute("aria-hidden")).toBe("true");
    expect(marker?.parentElement?.classList.contains("vk-gate-pin")).toBe(true);
    expect(marker?.closest("figure")).toBeNull();
    expect(marker?.textContent).toBe("");
    expect(
      Array.from(marker?.querySelectorAll("i") ?? []).map((segment) =>
        segment.getAttribute("data-state"),
      ),
    ).toEqual([...GATE_STATES]);
    expect(root.querySelectorAll("figcaption .vk-gate-marker, .vk-gate-marker")).toHaveLength(0);
    const hidden = Array.from(root.querySelectorAll("[aria-hidden]"));
    expect(
      hidden.every(
        (node) =>
          node.classList.contains("vk-gate-progress") || node.classList.contains("vk-lock-sign"),
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
  const STATES = ["candidate", "refused", "stale"] as const;
  const skill = readFileSync(
    join(import.meta.dirname, "../../../../.claude/skills/docs-ui/SKILL.md"),
    "utf8",
  );
  const pinned = (selector: string) =>
    rules.find(
      (rule) => rule.selector.split(/,\s*/).includes(selector) && rule.media.includes("@supports"),
    );
  const declared = (selector: string, property: string): string | undefined =>
    rules.find(
      (rule) =>
        rule.selector.split(/,\s*/).includes(selector) &&
        rule.media.includes("@supports") &&
        rule.declarations[property] !== undefined,
    )?.declarations[property];
  const squash = (value: string | undefined): string =>
    (value ?? "").replace(/\s+/g, " ").replace(/\( /g, "(").replace(/ \)/g, ")");
  const stopsOf = (name: string) =>
    keyframes
      .filter((rule) => rule.media.endsWith(`@keyframes ${name}`))
      .flatMap((rule) =>
        rule.selector.split(/,\s*/).map((offset) => ({
          offset: Number.parseFloat(offset),
          declarations: rule.declarations,
        })),
      )
      .sort((a, b) => a.offset - b.offset);
  const positions = (): number[] =>
    Array.from({ length: GATE_PIN_SVH * 20 + 1 }, (_, step) => step / 20);
  const valueAt = (name: string, property: string, svh: number): string | undefined =>
    stopsOf(name)
      .filter((stop) => stop.offset <= (svh / GATE_PIN_SVH) * 100 + 1e-3)
      .at(-1)?.declarations[property];

  it("scrubs only inside a supports test and the no-preference query, from 64rem wide and 42rem tall, on the screen only", () => {
    expect(timelineRules.length).toBeGreaterThan(0);
    for (const rule of timelineRules) {
      expect(rule.media, rule.selector).toContain("@supports (animation-timeline: view())");
      expect(rule.media, rule.selector).toContain("prefers-reduced-motion: no-preference");
      expect(rule.media, rule.selector).toContain("(min-width: 64rem)");
      expect(rule.media, rule.selector).toContain("(min-height: 42rem)");
      expect(rule.media, rule.selector).toMatch(/\(\s*scripting: enabled\s*\)/);
      expect(rule.media, rule.selector).toContain("@media screen and");
    }
  });

  it("pins one sticky stage as long as the schedule says and clips nothing on the way: the full-bleed page does, the stage and the pin do not", () => {
    const track = rules.find((rule) => rule.selector === ".vk-gate-track" && rule.media !== "");
    expect(track?.declarations["--vk-gate-pin"]).toBe(`${GATE_PIN_SVH}svh`);
    expect(track?.declarations.height).toBe("calc(var(--vk-gate-pin) + var(--vk-gate-stage))");
    expect(pinned(".vk-gate-pin")?.declarations.position).toBe("sticky");
    for (const selector of [".vk-gate-stage", ".vk-gate-pin", ".vk-gate-track", ".vk-gate-frame"])
      for (const rule of rules.filter((candidate) => candidate.selector === selector))
        for (const property of ["overflow", "overflow-x", "overflow-clip-margin", "clip-path"])
          expect(rule.declarations[property], `${selector} ${property}`).toBeUndefined();
    expect(
      rules.some(
        (rule) =>
          rule.selector === ".vk-home" &&
          rule.media === "" &&
          rule.declarations["overflow-x"] === "clip",
      ),
    ).toBe(true);
    expect(docsGlobalCss()).not.toContain("overflow-clip-margin");
  });

  it("slides by the schedule's distance: a plain 64px below 80rem, from 80rem the room left of the content held between 64px and 96px", () => {
    const track = rules.filter(
      (rule) => rule.selector === ".vk-gate-track" && rule.media.includes("@supports"),
    );
    const slide = (media: string) =>
      squash(track.find((rule) => rule.media.includes(media))?.declarations["--vk-gate-slide"]);
    const room = "max(var(--gutter), calc((100vw - var(--width-wide)) / 2 + var(--gutter) - 8px))";
    expect(slide("min-width: 64rem")).toBe(`${GATE_SLIDE_PX}px`);
    expect(slide(`min-width: ${GATE_SLIDE_WIDE_REM}rem`)).toBe(
      `min(${GATE_SLIDE_WIDE_PX}px, max(${GATE_SLIDE_PX}px, ${room}))`,
    );
  });

  it("registers the slide as a length and the state and the three carriers as an integer and numbers, so a stepped or transitioning value is typed", () => {
    const css = docsGlobalCss();
    const block = (name: string) =>
      new RegExp(`@property ${name} \\{([^}]*)\\}`).exec(css)?.[1] ?? "";
    expect(block("--vk-gate-slide")).toContain('syntax: "<length>";');
    expect(block("--vk-gate-slide")).toContain(`initial-value: ${GATE_SLIDE_PX}px;`);
    expect(block("--vk-gate-state")).toContain('syntax: "<integer>";');
    expect(block("--vk-gate-shown")).toContain('syntax: "<integer>";');
    for (const name of [
      "--vk-gate-state",
      "--vk-gate-shown",
      "--vk-gate-in",
      "--vk-gate-out",
      "--vk-gate-arrive",
    ]) {
      expect(block(name), name).toContain("inherits: true;");
      expect(block(name), name).toContain("initial-value: 0;");
    }
    for (const name of ["--vk-gate-in", "--vk-gate-out", "--vk-gate-arrive"])
      expect(block(name), name).toContain('syntax: "<number>";');
  });

  it("makes every state wider than the largest page step measured, with margin, so one page key never skips a state", () => {
    for (const index of [0, 1, 2]) {
      const [from, to] = gateStateRange(index);
      expect(to - from, `state ${index}`).toBeGreaterThanOrEqual(
        GATE_PAGE_STEP_MAX_SVH + GATE_PAGE_STEP_MARGIN_SVH,
      );
    }
    expect(GATE_CUTS[0]).toBe(gateStateRange(0)[1]);
    expect(GATE_CUTS[1]).toBe(gateStateRange(2)[0]);
  });

  it("ties the landing offset the e2e specs subtract to the header height token", () => {
    expect(docsGlobalCss()).toContain(`--header-height: ${GATE_LANDING_OFFSET_PX / 16}rem;`);
  });

  it("lets the scroll timeline step one integer on the pin: the state is 0, 1 or 2 by position, held by step-end between adjacent stops", () => {
    const pin = pinned(".vk-gate-pin");
    expect(pin?.declarations["animation-name"]).toBe("vk-gate-state");
    expect(pin?.declarations["animation-timeline"]).toBe("--vk-gate");
    expect(pin?.declarations["animation-range"]).toBe("contain 0% contain 100%");
    expect(pin?.declarations["animation-timing-function"]).toBe("linear");
    expect(pin?.declarations["animation-fill-mode"]).toBe("both");
    for (const [index, cut] of GATE_CUTS.entries()) {
      const before = stopsOf("vk-gate-state").find(
        (stop) => stop.offset === Number.parseFloat(gatePercent(cut - GATE_CUT_LEAD_SVH)),
      );
      expect(before?.declarations["animation-timing-function"], `cut ${index}`).toBe("step-end");
      expect(before?.declarations["--vk-gate-state"], `cut ${index}`).toBe(String(index));
    }
    for (const svh of positions())
      expect(valueAt("vk-gate-state", "--vk-gate-state", svh), `${svh.toFixed(2)}svh`).toBe(
        String(gateStateAt(svh)),
      );
  });

  it("scrolls no opacity and no transform on a frame, a caption, a card or an accent: only the state, the pointer of a frame and the progress fill", () => {
    const allowed: Record<string, ReadonlyArray<string>> = {
      "vk-gate-state": ["--vk-gate-state", "animation-timing-function"],
      "vk-gate-hit-candidate": ["pointer-events", "animation-timing-function"],
      "vk-gate-hit-refused": ["pointer-events", "animation-timing-function"],
      "vk-gate-hit-stale": ["pointer-events", "animation-timing-function"],
      "vk-gate-fill": ["transform"],
    };
    const names = new Set(keyframes.map((rule) => rule.media.replace(/^.*@keyframes /, "")));
    expect([...names].sort()).toEqual(Object.keys(allowed).sort());
    for (const rule of keyframes) {
      const name = rule.media.replace(/^.*@keyframes /, "");
      expect(
        Object.keys(rule.declarations).filter((property) => !allowed[name]?.includes(property)),
        name,
      ).toEqual([]);
    }
    expect(timelineRules.map((rule) => rule.selector).sort()).toEqual(
      [".vk-gate-pin", ".vk-gate-frame", ".vk-gate-progress i::after"].sort(),
    );
    const css = docsGlobalCss();
    for (const gone of [
      "vk-gate-caption-in",
      "vk-gate-caption-out",
      "vk-gate-card-in",
      "vk-gate-card-out",
      "vk-gate-chip",
      "vk-gate-drop",
      "vk-gate-stamp",
      "vk-gate-candidate",
      "vk-gate-refused",
      "vk-gate-stale",
    ])
      expect(css, gone).not.toMatch(new RegExp(`(@keyframes|animation-name:)\\s*${gone}\\b`));
  });

  it("hands the pointer to the frame of the current state and to no other, at every position of the pin", () => {
    for (const svh of positions()) {
      const current = gateStateAt(svh);
      STATES.forEach((state, index) => {
        expect(
          valueAt(`vk-gate-hit-${state}`, "pointer-events", svh),
          `${state} at ${svh.toFixed(2)}svh`,
        ).toBe(index === current ? "auto" : "none");
      });
    }
    for (const state of STATES)
      expect(declared(`.vk-gate-frame[data-state="${state}"]`, "animation-name")).toBe(
        `vk-gate-hit-${state}`,
      );
    for (const rule of rules.filter((candidate) => candidate.selector.includes("vk-gate")))
      expect(rule.declarations.visibility, rule.selector).toBeUndefined();
  });

  it("derives each frame's opacity and offset from the state with calc, max, min and clamp only, from one position per frame", () => {
    const frame = pinned(".vk-gate-frame")?.declarations ?? {};
    expect(squash(frame["--vk-gate-there"])).toBe(
      "clamp(-1, calc(var(--vk-gate-index) - var(--vk-gate-shown)), 1)",
    );
    expect(frame["--vk-gate-in"]).toBe("var(--vk-gate-there)");
    expect(squash(frame["--vk-gate-out"])).toBe(
      "clamp(-1, calc(var(--vk-gate-index) - var(--vk-gate-state)), 1)",
    );
    expect(squash(frame["--vk-gate-current"])).toBe(
      "calc(1 - min(1, max(var(--vk-gate-there), var(--vk-gate-there) * -1)))",
    );
    expect(frame["--vk-gate-arrive"]).toBe("var(--vk-gate-current)");
    expect(squash(frame["--vk-gate-away"])).toBe(
      "max(var(--vk-gate-in), var(--vk-gate-in) * -1, var(--vk-gate-out), var(--vk-gate-out) * -1)",
    );
    expect(squash(frame.opacity)).toBe(
      `calc((1 - ${Array.from({ length: GATE_FADE_EXPONENT }, () => "var(--vk-gate-away)").join(" * ")}) * var(--vk-gate-current))`,
    );
    for (const [index, state] of STATES.entries())
      expect(declared(`.vk-gate-frame[data-state="${state}"]`, "--vk-gate-index")).toBe(
        String(index),
      );
    const css = docsGlobalCss();
    const gate = css.slice(css.indexOf("\n.vk-gate-track {"));
    for (const forbidden of [/\babs\(/, /\bsign\(/, /@container\s+style/, /\bif\(/])
      expect(gate).not.toMatch(forbidden);
  });

  it("runs the handoff on time: the outgoing frame leaves first on the exit easing, the incoming one arrives after it on the standard easing, inside the ceiling, with static values only", () => {
    const transition = squash(pinned(".vk-gate-frame")?.declarations.transition);
    expect(transition).toBe(
      [
        `--vk-gate-in ${GATE_ENTER_MS}ms var(--ease-standard)`,
        `--vk-gate-out ${GATE_EXIT_MS}ms var(--ease-exit)`,
        `--vk-gate-arrive ${GATE_ACCENT_MS}ms var(--ease-standard)`,
      ].join(", "),
    );
    expect(squash(pinned(".vk-gate-stage")?.declarations.transition)).toBe(
      `--vk-gate-shown ${GATE_STEP_MS}ms linear ${GATE_ENTER_DELAY_MS}ms`,
    );
    expect(pinned(".vk-gate-stage")?.declarations["--vk-gate-shown"]).toBe("var(--vk-gate-state)");
    expect(transition).not.toContain("var(--vk-");
    expect(GATE_ENTER_DELAY_MS + GATE_ENTER_MS).toBeLessThanOrEqual(GATE_HANDOFF_CEILING_MS);
    expect(GATE_ENTER_DELAY_MS + GATE_ACCENT_MS).toBeLessThanOrEqual(GATE_HANDOFF_CEILING_MS);
    for (const rule of rules.filter((candidate) => candidate.selector.includes("vk-gate")))
      expect(rule.declarations["transition-delay"], rule.selector).toBeUndefined();
    const css = docsGlobalCss();
    expect(css.split("var(--ease-exit)").length - 1).toBeGreaterThanOrEqual(1);
    expect(uiTokensCss()).toContain("--ease-exit: cubic-bezier(0.4, 0, 1, 1);");
  });

  it("moves the caption and the card by the carriers, left when behind, right when ahead, the card also scaled, and animates no line of the pinned block", () => {
    const offset =
      "calc((max(var(--vk-gate-in), var(--vk-gate-out), 0) + min(var(--vk-gate-in), var(--vk-gate-out), 0)) * var(--vk-gate-slide))";
    expect(squash(declared(".vk-gate-frame > .vk-lock-caption", "translate"))).toBe(offset);
    expect(squash(declared(".vk-gate-frame > .vk-gate-card", "translate"))).toBe(offset);
    expect(squash(declared(".vk-gate-frame > .vk-gate-card", "scale"))).toBe(
      `calc(1 - ${Number((1 - GATE_SLIDE_SCALE).toFixed(2))} * min(1, var(--vk-gate-away)))`,
    );
    for (const selector of [
      ".vk-gate-frame > .vk-lock-caption",
      ".vk-gate-frame > .vk-gate-card",
    ]) {
      expect(declared(selector, "opacity"), selector).toBeUndefined();
      expect(declared(selector, "transition"), selector).toBeUndefined();
    }
    const supported = rules.filter((rule) => rule.media.includes("@supports"));
    expect(supported.filter((rule) => rule.selector.includes(".vk-lock-line"))).toEqual([]);
    expect(docsGlobalCss()).not.toMatch(/vk-gate-line|--vk-lines?-/);
    expect(root.innerHTML).not.toContain("--n:");
    for (const state of ["refused", "stale"]) {
      const lines = root.querySelectorAll(
        `figure[data-state='${state}'] .vk-gate-cli .vk-lock-line`,
      );
      expect(lines.length, state).toBeGreaterThan(2);
      for (const line of lines) expect((line as HTMLElement).getAttribute("style")).toBeNull();
    }
  });

  it("lands an in-page jump to #gate on the start of the pin by cancelling the section's own top padding, only while the stage is pinned", () => {
    const rule = rules.find((candidate) => candidate.selector === ".vk-home section.vk-gate[id]");
    expect(rule?.declarations["scroll-margin-top"]).toBe("calc(-1 * var(--section-rhythm))");
    expect(rule?.media).toContain("@supports (animation-timeline: view())");
    expect(rule?.media).toContain("min-width: 64rem");
    const padding = rules.find(
      (candidate) =>
        candidate.selector ===
        ".vk-home section[id]:is(.vk-rhythm-lg, .vk-rhythm-md, .vk-rhythm-sm)",
    );
    expect(padding?.declarations["padding-block-start"]).toBe("var(--section-rhythm)");
    expect(root.querySelector("section#gate")?.className).toContain("vk-rhythm-md");
    expect(skill).toContain("An in-page jump to `#gate` lands on the start of the pin");
  });

  it("runs the chip drop, the stamp and the exit badge on time from the frame that becomes active, ending in their rest state, and out-ranks the reveal", () => {
    const specificity = (selector: string): [number, number] => {
      const flat = selector.replace(/:not\(([^)]*)\)/g, " $1 ");
      return [
        (flat.match(/#[\w-]+/g) ?? []).length,
        (flat.match(/\.[\w-]+|\[[^\]]*\]|(?<!:):(?!:)[\w-]+/g) ?? []).length,
      ];
    };
    const yielding = "html[data-motion-ready] .vk-gate .vk-gate-track .vk-gate-moves";
    const accent = rules.find((rule) => rule.selector.split(/,\s*/).includes(yielding));
    expect(accent?.selector.split(/,\s*/)).toContain(".vk-gate-moves");
    expect(accent?.declarations).toMatchObject({
      opacity: "var(--vk-gate-arrive)",
      transition: "none",
    });
    expect(squash(accent?.declarations.translate)).toBe(
      `0 calc((1 - var(--vk-gate-arrive)) * -${GATE_DROP_PX}px)`,
    );
    const [ids, classes] = specificity(yielding);
    const [hidingIds, hidingClasses] = specificity(
      "html[data-motion-ready] [data-reveal]:not([data-revealed])",
    );
    expect(ids).toBe(hidingIds);
    expect(classes).toBeGreaterThan(hidingClasses);
    expect(squash(declared(".vk-gate-stamp", "scale"))).toBe(
      `calc(1 + ${Number((GATE_STAMP_SCALE - 1).toFixed(2))} * (1 - var(--vk-gate-arrive)))`,
    );
    expect(declared(".vk-gate-stamp", "transform-origin")).toBe("right center");
    const shape = rules.find((rule) => rule.selector === ".vk-gate-stamp" && rule.media === "");
    expect(shape?.declarations.border).toBe("1px solid var(--text-danger)");
    expect(shape?.declarations["border-radius"]).toBe("var(--radius-sm)");
  });

  it("runs the progress marker as three segments of at least the minimum width that fill across their whole state, back to back", () => {
    const base = rules.find((rule) => rule.selector === ".vk-gate-progress i" && rule.media === "");
    expect(base?.declarations.width).toBe(`${GATE_MARKER_MIN_PX / 16}rem`);
    expect(
      rules.find((rule) => rule.selector === ".vk-gate-progress" && rule.media === "")?.declarations
        .display,
    ).toBe("none");
    expect(declared(".vk-gate-progress", "display")).toBe("flex");
    const fill = pinned(".vk-gate-progress i::after");
    expect(fill?.declarations["transform-origin"]).toBe("left");
    expect(fill?.declarations["animation-name"]).toBe("vk-gate-fill");
    expect(fill?.declarations["animation-fill-mode"]).toBe("both");
    STATES.forEach((state, index) => {
      const [from, to] = gateMarkerRange(index);
      expect(declared(`.vk-gate-progress i[data-state="${state}"]::after`, "animation-range")).toBe(
        `contain ${gatePercent(from)} contain ${gatePercent(to)}`,
      );
      expect(from).toBeLessThanOrEqual(index === 0 ? 1 : (GATE_CUTS[index - 1] ?? 0));
    });
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
    expect(pinned(".vk-gate-frame")?.declarations["grid-column"]).toBe("1 / span 8");
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

  it("says in the skill's gate entry exactly what the schedule says", () => {
    const entry = skill.slice(skill.indexOf("- **Gate.**"), skill.indexOf("- **Phone length.**"));
    expect(entry.length).toBeGreaterThan(3000);
    const [first, second] = GATE_CUTS;
    expect(entry).toContain(`\`GATE_PIN_SVH\`, ${GATE_PIN_SVH}svh`);
    expect(entry).toContain(`the cuts at ${first} and ${second}svh`);
    expect(entry).toContain(`${GATE_PAGE_STEP_MAX_SVH}svh`);
    for (const [name, milliseconds] of [
      ["GATE_EXIT_MS", GATE_EXIT_MS],
      ["GATE_ENTER_DELAY_MS", GATE_ENTER_DELAY_MS],
      ["GATE_ENTER_MS", GATE_ENTER_MS],
      ["GATE_ACCENT_MS", GATE_ACCENT_MS],
      ["GATE_HANDOFF_CEILING_MS", GATE_HANDOFF_CEILING_MS],
      ["GATE_REVERSAL_SETTLE_MS", GATE_REVERSAL_SETTLE_MS],
    ] as const)
      expect(entry, name).toContain(`\`${name}\` (${milliseconds}ms)`);
    expect(entry).toContain("`--vk-gate-state`");
    for (const gone of [
      "dim window",
      "GATE_DIM",
      "GATE_RISE",
      "GATE_SWAP_CEILING_SVH",
      "GATE_HOLD_FLOOR_SVH",
      "gateFrameOpacity",
      "hard cut",
      "dims linearly",
    ])
      expect(skill, gone).not.toContain(gone);
  });

  it("never listens to scroll", () => {
    const source = readFileSync(join(import.meta.dirname, "gate.tsx"), "utf8");
    expect(source).not.toMatch(/addEventListener|"use client"|useEffect/);
  });
});
