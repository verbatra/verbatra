// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextIntlClientProvider } from "next-intl";
import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  GATE_CHECK_LINES,
  GATE_DE_CANDIDATE,
  GATE_DE_OLD,
  GATE_REFUSED_LINES,
  GATE_STATES,
} from "@/lib/gate-demo";
import { docsStylesheetRules } from "@/lib/stylesheet-rules";
import de from "@/messages/de.json";
import en from "@/messages/en.json";

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
    expect(root.querySelector(".vk-section-head-lead")?.textContent).toBe(
      "Every candidate passes an integrity gate before it reaches your file.",
    );
    expect(root.querySelector(".vk-eyebrow")).toBeNull();
    expect(root.querySelectorAll("h1, h2")).toHaveLength(1);
  });

  it("draws the three states in order, each a figure named by its caption", () => {
    expect(frames().map((frame) => frame.getAttribute("data-state"))).toEqual([...GATE_STATES]);
    for (const frame of frames()) {
      const caption = frame.querySelector("figcaption");
      expect(frame.getAttribute("aria-labelledby")).toBe(caption?.id);
    }
  });

  it("holds each value once: the candidate in the first frame, the old value in the second", () => {
    const text = root.textContent ?? "";
    expect(text.split(GATE_DE_CANDIDATE)).toHaveLength(2);
    expect(text.split(GATE_DE_OLD)).toHaveLength(2);
    const [candidate, refused] = frames();
    expect(candidate?.textContent).toContain(GATE_DE_CANDIDATE);
    expect(refused?.textContent).toContain(GATE_DE_OLD);
    expect(refused?.textContent).not.toContain(GATE_DE_CANDIDATE);
  });

  it("prints the refused translate lines and the check lines the run test pins", () => {
    const [, refused, stale] = frames();
    const text = (frame: Element | undefined) => frame?.querySelector("pre")?.textContent ?? "";
    for (const line of GATE_REFUSED_LINES) expect(text(refused)).toContain(line.trim());
    for (const line of GATE_CHECK_LINES) expect(text(stale)).toContain(line.trim());
    expect(refused?.textContent).not.toContain(GATE_CHECK_LINES[0]?.trim());
    expect(stale?.textContent).toContain("exit 1");
  });

  it("promises no re-run in any frame or caption", () => {
    expect(root.textContent).not.toMatch(/\b(re-?run|retr(y|ied)|next run|try again)\b/i);
  });

  it("gives each frame one meaningful moving element, marked for the shared reveal", () => {
    for (const frame of frames()) {
      expect(frame.querySelectorAll("[data-reveal]")).toHaveLength(1);
    }
    expect(root.querySelector(".vk-gate-stamp")?.textContent).toBe("not written");
    expect(root.querySelector("[aria-hidden]")).toBeNull();
  });

  it("keeps CLI text whole and in English on every locale", async () => {
    const german = await renderIn("de");
    for (const pre of german.querySelectorAll(
      "figure[data-state='refused'] pre, figure[data-state='stale'] pre",
    )) {
      expect(pre.getAttribute("lang")).toBe("en");
    }
    expect(german.querySelector("h2")?.textContent).not.toBe(root.querySelector("h2")?.textContent);
  });

  it("links the translation safety page once, after the stage", () => {
    const links = Array.from(root.querySelectorAll("a"));
    expect(links.map((link) => link.getAttribute("href"))).toEqual(["/docs/translation-safety"]);
  });
});

describe("the gate stylesheet", () => {
  const rules = docsStylesheetRules();
  const timelineRules = rules.filter((rule) =>
    (rule.declarations["animation-timeline"] ?? "").includes("--vk-gate"),
  );
  const keyframes = rules.filter((rule) => rule.media.includes("@keyframes vk-gate"));

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

  it("pins one sticky stage for 120svh and splits it 8, 30 and 3 svh per state", () => {
    const track = rules.find((rule) => rule.selector === ".vk-gate-track" && rule.media !== "");
    expect(track?.declarations.height).toBe("calc(120svh + var(--vk-gate-stage))");
    const pin = rules.find((rule) => rule.selector === ".vk-gate-pin" && rule.media !== "");
    expect(pin?.declarations.position).toBe("sticky");
    const percent = (svh: number) => `${Number(((svh / 120) * 100).toFixed(3))}%`;
    const refused = keyframes.filter((rule) => rule.media.endsWith("vk-gate-refused"));
    const offsets = refused.flatMap((rule) => rule.selector.split(/,\s*/));
    for (const svh of [41, 43, 79, 81]) expect(offsets).toContain(percent(svh));
    const stamp = rules.find((rule) => rule.selector === ".vk-gate-stamp" && rule.media !== "");
    expect(stamp?.declarations["animation-range"]).toBe(
      `contain ${percent(44)} contain ${percent(48)}`,
    );
  });

  it("keeps two frames from ever showing at once", () => {
    const opacityAt = (name: string, at: number): number => {
      const stops = keyframes
        .filter((rule) => rule.media.endsWith(name))
        .flatMap((rule) =>
          rule.selector
            .split(/,\s*/)
            .map(
              (offset) => [Number.parseFloat(offset), Number(rule.declarations.opacity)] as const,
            ),
        )
        .sort((a, b) => a[0] - b[0]);
      const after = stops.findIndex(([offset]) => offset >= at);
      if (after <= 0) return stops[Math.max(after, 0)]?.[1] ?? 0;
      const [x0, y0] = stops[after - 1] ?? [0, 0];
      const [x1, y1] = stops[after] ?? [0, 0];
      return x1 === x0 ? y1 : y0 + ((y1 - y0) * (at - x0)) / (x1 - x0);
    };
    const names = ["vk-gate-candidate", "vk-gate-refused", "vk-gate-stale"];
    for (let at = 0; at <= 100; at += 0.05) {
      const visible = names.filter((name) => opacityAt(name, at) > 0.1);
      expect(visible.length, `${at}%`).toBeLessThanOrEqual(1);
    }
  });

  it("animates only opacity and transform, plus the discrete visibility of a frame", () => {
    expect(keyframes.length).toBeGreaterThan(0);
    for (const rule of keyframes) {
      const frame = /vk-gate-(candidate|refused|stale)$/.test(rule.media);
      const allowed = frame ? ["opacity", "visibility"] : ["opacity", "transform"];
      expect(Object.keys(rule.declarations).filter((name) => !allowed.includes(name))).toEqual([]);
    }
  });

  it("holds the same layout in the stacked and the staged card", () => {
    const stacked = rules.find((rule) => rule.selector === ".vk-gate-card" && rule.media === "");
    expect(stacked?.declarations["max-width"]).toBe("52rem");
    expect(
      rules.some(
        (rule) =>
          rule.media.includes("@supports") &&
          ["height", "min-height", "aspect-ratio"].some((p) => p in rule.declarations) &&
          rule.selector.includes(".vk-gate-card"),
      ),
    ).toBe(false);
  });

  it("paints every failing badge in the danger colour, never the accent", () => {
    const rule = rules.find((r) => r.selector === ".vk-gate-fail" && r.media === "");
    expect(rule?.declarations.color).toBe("var(--text-danger)");
    expect(root.querySelectorAll(".vk-lock-badge.vk-gate-fail")).toHaveLength(2);
    const [candidate] = frames();
    expect(candidate?.querySelector(".vk-gate-fail")).toBeNull();
  });

  it("outlines the card in forced colors and never uses a literal colour", () => {
    expect(
      rules.some(
        (rule) =>
          rule.selector === ".vk-gate-card" &&
          rule.media.includes("forced-colors") &&
          rule.declarations.outline === "2px solid Highlight",
      ),
    ).toBe(true);
    const css = readFileSync(join(process.cwd(), "app/global.css"), "utf8");
    const gate = css.slice(css.indexOf(".vk-gate-track {"));
    expect(gate).not.toMatch(/#[0-9a-f]{3,8}\b|hsl\(|rgb\(/i);
  });

  it("never listens to scroll", () => {
    const source = readFileSync(join(import.meta.dirname, "gate.tsx"), "utf8");
    expect(source).not.toMatch(/addEventListener|"use client"|useEffect/);
  });
});
