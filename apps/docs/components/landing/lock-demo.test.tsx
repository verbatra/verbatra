// @vitest-environment jsdom

import { renderToString } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  HERO_CHECK_BADGE,
  HERO_CHECK_OUTPUT,
  HERO_TRANSLATE_BADGE,
  HERO_TRANSLATE_LOCALE_LINES,
} from "@/lib/hero-terminal";
import { i18n } from "@/lib/i18n";
import {
  PLAYGROUND_METADATA,
  PLAYGROUND_SOURCE_LOCALE,
  PLAYGROUND_TRANSLATIONS,
  playgroundGeneratedOn,
} from "@/lib/landing-playground";
import { LOCK_DEMO_COUNTS, LOCK_DEMO_PLAYGROUND_IDS } from "@/lib/lock-demo";
import de from "@/messages/de.json";
import en from "@/messages/en.json";
import es from "@/messages/es.json";
import fr from "@/messages/fr.json";
import { preloadRegisteredIslands } from "@/test-support/islands";

vi.mock("next-intl/server", async () => {
  const { createTranslator } = await import("next-intl");
  const { default: messages } = await import("@/messages/en.json");
  return {
    getTranslations: async (scope: string) =>
      createTranslator({ locale: "en", messages, namespace: scope as never }),
    getLocale: async () => "en",
  };
});

const { LockDemo } = await import("./lock-demo");

const CATALOGS = { en, de, es, fr } as const;

type Tree = { [key: string]: string | Tree };

function leaves(tree: Tree, prefix = ""): string[] {
  return Object.entries(tree).flatMap(([key, value]) =>
    typeof value === "string" ? [`${prefix}${key}`] : leaves(value, `${prefix}${key}.`),
  );
}

async function translator(locale: keyof typeof CATALOGS) {
  const { createTranslator } = await import("next-intl");
  return createTranslator({
    locale,
    messages: CATALOGS[locale] as never,
    namespace: "landing.lockDemo" as never,
    onError: (error) => {
      throw error;
    },
  });
}

let doc: Document;

beforeAll(async () => {
  await preloadRegisteredIslands();
  doc = new DOMParser().parseFromString(renderToString(await LockDemo()), "text/html");
});

describe("the lock demo heading and counts", () => {
  it.each(i18n.languages)("%s spells the changed count out and shows no digit", async (locale) => {
    const t = await translator(locale);
    const heading = t("heading" as never, { count: LOCK_DEMO_COUNTS.changed } as never);
    expect(heading).not.toMatch(/\d/);
  });

  it.each(i18n.languages)(
    "%s falls back to digits when the fixture count changes",
    async (locale) => {
      const t = await translator(locale);
      expect(t("heading" as never, { count: 3 } as never)).toMatch(/3/);
    },
  );

  it.each(["es", "fr"] as const)(
    "%s puts the linking word after a million, and nothing at one",
    async (locale) => {
      const t = await translator(locale);
      const million = { count: 1_000_000, rest: 5 };
      const one = { count: 1, rest: 5 };
      for (const path of ["heading", "edit.text", "compare.text", "send.text", "foot.lock"]) {
        expect(t(path as never, { ...million, file: "f" } as never), `${locale} ${path}`).toMatch(
          /1\D000\D000 de (claves|clés|valores|valeurs|hashes)/,
        );
        expect(t(path as never, { ...one, file: "f" } as never), `${locale} ${path}`).not.toMatch(
          /\bde (claves|clés|valores|valeurs|hashes)/,
        );
      }
    },
  );

  it.each(i18n.languages)(
    "%s formats every message with the values the section passes",
    async (locale) => {
      const t = await translator(locale);
      const values = { count: 2, rest: 12, file: "en.json", date: "x" };
      const tree = (CATALOGS[locale].landing as unknown as { lockDemo: Tree }).lockDemo;
      for (const path of leaves(tree)) {
        expect(() => t(path as never, values as never), `${locale} ${path}`).not.toThrow();
      }
    },
  );

  it.each(["de", "es", "fr"] as const)(
    "%s names the CLI's own word once in the stale footnote",
    (locale) => {
      const lockDemo = (CATALOGS[locale].landing as unknown as { lockDemo: Tree }).lockDemo;
      const note = (lockDemo.foot as Tree).compare as string;
      expect(note.match(/\(stale\)/g)).toHaveLength(1);
    },
  );

  it.each(i18n.languages)("%s opens the stale footnote with the word its tag uses", (locale) => {
    const lockDemo = (CATALOGS[locale].landing as unknown as { lockDemo: Tree }).lockDemo;
    const word = (lockDemo.tags as Tree).stale as string;
    const note = (lockDemo.foot as Tree).compare as string;
    expect(note.toLowerCase().startsWith(word.toLowerCase())).toBe(true);
  });

  it("renders the English heading from the fixture count", () => {
    expect(doc.querySelector("h2")?.textContent).toBe("Two keys changed, two keys sent");
    expect(doc.querySelector("section")?.getAttribute("aria-labelledby")).toBe(
      doc.querySelector("h2")?.id,
    );
    expect(doc.querySelector("p.vk-eyebrow")?.textContent).toBe("The lock file");
  });

  it("states the counts in the step texts and badges from the fixture, without a typed number", () => {
    const text = doc.body.textContent ?? "";
    expect(text).toContain("You change 2 values in your source file.");
    expect(text).toContain("2 recorded hashes no longer match.");
    expect(text).toContain("The other 12 are not sent.");
    expect(text).not.toMatch(/never sent/);
    expect(text).toContain(HERO_CHECK_BADGE);
    expect(text).toContain(HERO_TRANSLATE_BADGE);
  });
});

describe("the three frames", () => {
  const frames = () => Array.from(doc.querySelectorAll<HTMLElement>("figure.vk-lock-frame"));

  it("are figures named by their caption, in the order edit, compare, send", () => {
    expect(frames()).toHaveLength(3);
    for (const frame of frames()) {
      const caption = frame.querySelector("figcaption");
      expect(caption?.id).toBe(`${frame.id}-caption`);
      expect(frame.getAttribute("aria-labelledby")).toBe(caption?.id);
    }
    expect(frames().map((frame) => frame.querySelector("figcaption b")?.textContent)).toEqual([
      "Edit",
      "Compare",
      "Send",
    ]);
  });

  it("marks each of the three cards for the shared reveal once and nothing else in the section", () => {
    const marked = Array.from(doc.querySelectorAll("[data-reveal]"));
    expect(marked).toHaveLength(3);
    for (const [index, node] of marked.entries()) {
      expect(node.classList.contains("vk-lock-card")).toBe(true);
      expect(node.getAttribute("data-reveal")).toBe("0");
      expect(node.closest("figure")).toBe(frames()[index]);
    }
    expect(doc.querySelector("h2[data-reveal], h3[data-reveal], p[data-reveal]")).toBeNull();
  });

  it("marks the English source values of the first frame with the source language", () => {
    const values = Array.from(frames()[0]?.querySelectorAll(".vk-lock-value") ?? []);
    expect(values.length).toBeGreaterThan(0);
    expect(values.map((value) => value.getAttribute("lang"))).toEqual(
      values.map(() => PLAYGROUND_SOURCE_LOCALE),
    );
  });

  it("show the three file names as visible captions", () => {
    const heads = frames().map((frame) => frame.querySelector(".vk-lock-head span")?.textContent);
    expect(heads).toEqual(["en.json", "verbatra.lock.json", "verbatra translate"]);
  });

  it("label no role-less pre and add no tab stop, since nothing scrolls", () => {
    for (const pre of doc.querySelectorAll("pre")) {
      expect(pre.getAttribute("aria-label")).toBeNull();
      expect(pre.getAttribute("tabindex")).toBeNull();
    }
    expect(doc.querySelector("[tabindex]")).toBeNull();
  });

  it("puts the changed keys of en.json and the stale ones of the lock in marked lines", () => {
    const [source, lock] = frames();
    const marked = (frame: HTMLElement | undefined) =>
      Array.from(frame?.querySelectorAll("[data-mark]") ?? []).map((line) =>
        line.getAttribute("data-mark"),
      );
    expect(marked(source)).toEqual(["changed", "changed"]);
    expect(marked(lock)).toEqual(["stale", "stale"]);
  });

  it("show the real CLI line for German in English, with the command above it", () => {
    const cli = frames()[2]?.querySelector("pre.vk-lock-cli");
    expect(cli?.getAttribute("lang")).toBe("en");
    expect(cli?.textContent).toContain("$ npx @verbatra/cli translate");
    expect(cli?.textContent).toContain(HERO_TRANSLATE_LOCALE_LINES[0] ?? "");
    expect(HERO_CHECK_OUTPUT[1]).toContain(`${LOCK_DEMO_COUNTS.changed} stale`);
  });

  it("show the generated German values, each in lang de, and label only those as pre-generated", () => {
    const values = Array.from(frames()[2]?.querySelectorAll(".vk-lock-value") ?? []);
    expect(values.map((value) => value.getAttribute("lang"))).toEqual(["de", "de"]);
    expect(values.map((value) => value.textContent)).toEqual(
      Object.values(LOCK_DEMO_PLAYGROUND_IDS).map((id) => `"${PLAYGROUND_TRANSLATIONS.de?.[id]}"`),
    );
    const label = frames()[2]?.querySelector(".vk-lock-sub");
    expect(label?.textContent).toBe("de.json pre-generated, not live");
    expect(frames()[0]?.textContent).not.toContain("pre-generated");
    expect(frames()[1]?.textContent).not.toContain("pre-generated");
  });

  it("name the model and date from the generated file's metadata and print no token figure", () => {
    const foot = frames()[2]?.querySelector(".vk-lock-foot");
    expect(foot?.textContent).toContain(PLAYGROUND_METADATA.model);
    expect(foot?.querySelector("time")?.getAttribute("datetime")).toBe(
      playgroundGeneratedOn("en").iso,
    );
    expect(foot?.textContent).toContain(playgroundGeneratedOn("en").text);
    expect(doc.body.textContent).not.toMatch(/token/i);
  });

  it("ends each tag in at least 11px of text", async () => {
    const { readFileSync } = await import("node:fs");
    const css = readFileSync(`${process.cwd()}/app/global.css`, "utf8");
    const tag = /\.vk-lock-tag \{[^}]*font-size: ([\d.]+)rem/.exec(css);
    expect(Number(tag?.[1]) * 16).toBeGreaterThanOrEqual(11);
    expect(css).not.toMatch(/\.vk-lock-tag \{[^}]*font-size: 0\.[0-5]/);
  });

  it("lays the stage out in CSS before hydration, only where scripting is available", async () => {
    const { readFileSync } = await import("node:fs");
    const css = readFileSync(`${process.cwd()}/app/global.css`, "utf8");
    const block =
      /@media \(min-width: 64rem\) and \(prefers-reduced-motion: no-preference\) and \(scripting: enabled\) \{/.exec(
        css,
      );
    expect(block).not.toBeNull();
    const from = block?.index ?? 0;
    const media = css.slice(from, css.indexOf("\n}\n", css.indexOf(".vk-lock-frames", from)) + 3);
    expect(media).toContain(".vk-lock-stage .vk-lock-frames");
    expect(media).toContain(".vk-lock-stage:not([data-mode]) .vk-lock-frame:first-child");
    expect(media).toContain(".vk-lock-stage:not([data-mode]) .vk-lock-frames");
  });

  it("starts the progress bar only once the island has set the stage", async () => {
    const { readFileSync } = await import("node:fs");
    const css = readFileSync(`${process.cwd()}/app/global.css`, "utf8");
    expect(css).toMatch(
      /\.vk-lock-stage\[data-mode\] \.vk-lock-prog \{[^}]*animation: vk-lock-progress/,
    );
    expect(/\n\.vk-lock-prog \{([^}]*)\}/.exec(css)?.[1]).not.toContain("animation:");
  });

  it("makes the failsafe look exactly like the stack: captions back, no staged card treatment", async () => {
    const { readFileSync } = await import("node:fs");
    const css = readFileSync(`${process.cwd()}/app/global.css`, "utf8");
    expect(css).toMatch(
      /\.vk-lock-stage:not\(\[data-mode\]\) \.vk-lock-caption \{[^}]*animation: vk-lock-unstage-caption 1ms linear 10s forwards/,
    );
    expect(css).toMatch(
      /\.vk-lock-stage:not\(\[data-mode\]\) \.vk-lock-card \{[^}]*animation: vk-lock-unstage-card 1ms linear 10s forwards/,
    );
    const card = /@keyframes vk-lock-unstage-card \{([\s\S]*?)\n {2}\}\n/.exec(css)?.[1] ?? "";
    expect(card).toContain("border-color: var(--border-tile)");
    expect(card).toContain("box-shadow: none");
  });

  it("gives the current step a border in forced colors, where the progress bar is repainted", async () => {
    const { readFileSync } = await import("node:fs");
    const css = readFileSync(`${process.cwd()}/app/global.css`, "utf8");
    const forced =
      /@media \(forced-colors: active\) \{[^@]*\.vk-lock-step\[aria-current="step"\] \{([^}]*)\}/.exec(
        css,
      );
    expect(forced?.[1]).toMatch(/outline: \d+px solid Highlight/);
  });

  it("rounds the tag chip like the placeholder chip", async () => {
    const { readFileSync } = await import("node:fs");
    const css = readFileSync(`${process.cwd()}/app/global.css`, "utf8");
    const chip = /\.vk-lock-tag \{([^}]*)\}/.exec(
      css.slice(css.indexOf("@media (min-width: 40rem) {\n  .vk-lock-stage:not")),
    );
    expect(chip?.[1]).toContain("border-radius: 5px");
    expect(css).not.toMatch(/\.vk-lock-tag[^{]*\{[^}]*border-radius: 4px/);
  });

  it("retires the unmounted controls with visibility and a collapsed block, never an animated display", async () => {
    const { readFileSync } = await import("node:fs");
    const css = readFileSync(`${process.cwd()}/app/global.css`, "utf8");
    const keyframes = [
      ...css.matchAll(/@keyframes (vk-lock-unstage-[\w-]+) \{[\s\S]*?\n {2}\}\n/g),
    ];
    expect(keyframes.length).toBeGreaterThan(0);
    for (const [body] of keyframes) {
      expect(body).not.toMatch(/\bdisplay:/);
    }
    const side = /@keyframes vk-lock-unstage-side \{([\s\S]*?)\n {2}\}\n/.exec(css)?.[1] ?? "";
    expect(side).toMatch(/1%,\s*to \{\s*visibility: hidden;/);
    expect(side).toContain("max-block-size: 0");
  });

  it("lets a phone drop the unchanged neighbours of the lock frame and fold them into the gaps", () => {
    const lock = frames()[1];
    const dropped = Array.from(lock?.querySelectorAll("[data-fold='drop']") ?? []);
    expect(dropped.map((line) => line.querySelector(".vk-lock-key")?.textContent)).toEqual([
      '"cart.total"',
      '"errors.notFound"',
    ]);
    const gaps = Array.from(lock?.querySelectorAll("[data-kind='gap']") ?? []);
    expect(gaps.map((gap) => gap.textContent?.trim())).toEqual([
      "… 4 more, unchanged",
      "… 6 more, unchanged",
    ]);
    expect(gaps.map((gap) => gap.getAttribute("data-short"))).toEqual([
      "… 5 more, unchanged",
      "… 7 more, unchanged",
    ]);
    expect(frames()[0]?.querySelector("[data-fold]")).toBeNull();
  });

  it("lets a phone drop the head row and the lock line of the send frame that repeat the CLI", () => {
    const send = frames()[2];
    expect(send?.querySelector(".vk-lock-head")?.getAttribute("data-fold")).toBe("drop");
    expect(send?.querySelector(".vk-lock-foot-lock")?.textContent).toContain(
      "verbatra.lock.json: 2 hashes updated.",
    );
    expect(frames()[1]?.querySelector(".vk-lock-head")?.getAttribute("data-fold")).toBeNull();
  });

  it("is the island's step list that controls these exact frames", () => {
    const controls = Array.from(doc.querySelectorAll("button.vk-lock-step")).map((button) =>
      button.getAttribute("aria-controls"),
    );
    expect(controls).toEqual(frames().map((frame) => frame.id));
  });
});
