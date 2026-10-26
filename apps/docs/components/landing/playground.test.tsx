// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PLAYGROUND_DEFAULT_ITEM,
  PLAYGROUND_ITEMS,
  PLAYGROUND_KEPT_STRINGS,
  PLAYGROUND_LANGUAGES,
  PLAYGROUND_PICKS,
  PLAYGROUND_SNIPPET,
  PLAYGROUND_TRANSLATIONS,
} from "@/lib/landing-playground";
import { HOLD_MS, intactPlaceholders, sceneEnd, TICK_MS } from "@/lib/playground-cycle";
import { docsStylesheetRules, rulesFor } from "@/lib/stylesheet-rules";
import messages from "@/messages/en.json";
import { preloadRegisteredIslands } from "@/test-support/islands";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const page = vi.hoisted(() => ({ locale: "en" }));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    prefetch: _prefetch,
    ...rest
  }: {
    href: string;
    children: ReactNode;
    prefetch?: boolean;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("next-intl/server", async () => {
  const { createTranslator } = await import("next-intl");
  const catalogs = {
    en: (await import("@/messages/en.json")).default,
    de: (await import("@/messages/de.json")).default,
    es: (await import("@/messages/es.json")).default,
    fr: (await import("@/messages/fr.json")).default,
  };
  return {
    getTranslations: async (scope: string | { namespace: string }) =>
      createTranslator({
        locale: page.locale,
        messages: catalogs[page.locale as keyof typeof catalogs],
        namespace: (typeof scope === "string" ? scope : scope.namespace) as never,
      }),
    getLocale: async () => page.locale,
  };
});

vi.mock("next-intl", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next-intl")>();
  const { default: catalog } = await import("@/messages/en.json");
  return {
    ...actual,
    useTranslations: (namespace: string) =>
      actual.createTranslator({ locale: "en", messages: catalog, namespace: namespace as never }),
  };
});

const { Playground } = await import("./playground");

await preloadRegisteredIslands();

const copy = messages.landing.playground;

let reduced = false;

let hidden = false;

let motionListeners: Array<() => void> = [];

let observed: Array<(entries: Array<{ isIntersecting: boolean }>) => void> = [];

beforeEach(() => {
  vi.useFakeTimers();
  reduced = false;
  hidden = false;
  observed = [];
  motionListeners = [];
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      get matches() {
        return query.includes("reduce") ? reduced : !reduced;
      },
      media: query,
      addEventListener: (_: string, listener: () => void) => void motionListeners.push(listener),
      removeEventListener: (_: string, listener: () => void) => {
        motionListeners = motionListeners.filter((entry) => entry !== listener);
      },
    }),
  });
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => (hidden ? "hidden" : "visible"),
  });
  class FakeObserver {
    constructor(callback: (entries: Array<{ isIntersecting: boolean }>) => void) {
      observed.push(callback);
    }
    observe() {}
    disconnect() {}
  }
  Object.defineProperty(window, "IntersectionObserver", {
    configurable: true,
    value: FakeObserver,
  });
  Object.defineProperty(globalThis, "IntersectionObserver", {
    configurable: true,
    value: FakeObserver,
  });
});

const mounted: Array<{ root: Root; host: HTMLElement }> = [];

afterEach(() => {
  for (const { root, host } of mounted.splice(0)) {
    act(() => root.unmount());
    host.remove();
  }
  vi.useRealTimers();
});

async function renderServer(locale = "en"): Promise<HTMLElement> {
  page.locale = locale;
  const container = document.createElement("div");
  container.innerHTML = renderToString(await Playground());
  return container;
}

async function mount(locale = "en"): Promise<HTMLElement> {
  page.locale = locale;
  const node = await Playground();
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  mounted.push({ root, host });
  await act(async () => root.render(node));
  return host;
}

function demo(root: ParentNode): HTMLElement {
  const found = root.querySelector<HTMLElement>("[data-playground-demo]");
  if (found === null) throw new Error("no playground demo");
  return found;
}

function rows(root: ParentNode): HTMLButtonElement[] {
  return [...root.querySelectorAll<HTMLButtonElement>(".vk-playground-row")];
}

function picks(root: ParentNode): HTMLButtonElement[] {
  return [...root.querySelectorAll<HTMLButtonElement>(".vk-playground-pick")];
}

function liveRegions(root: ParentNode): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>("[aria-live]")].filter(
    (region) => region.closest("figure") === null,
  );
}

function pause(root: ParentNode): HTMLButtonElement {
  const button = root.querySelector<HTMLButtonElement>(".vk-playground-pause");
  if (button === null) throw new Error("no pause control");
  return button;
}

async function enterView(): Promise<void> {
  await act(async () => {
    for (const callback of observed) callback([{ isIntersecting: true }]);
  });
}

async function leaveView(): Promise<void> {
  await act(async () => {
    for (const callback of observed) callback([{ isIntersecting: false }]);
  });
}

async function advance(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function sceneMs(index: number): number {
  const pick = PLAYGROUND_PICKS[index];
  return sceneEnd(pick?.text.length ?? 0, PLAYGROUND_LANGUAGES.length);
}

function srTexts(root: ParentNode): Array<[string | null, string]> {
  return rows(root).map((row) => {
    const node = row.querySelector(".sr-only");
    return [node?.getAttribute("lang") ?? null, node?.textContent ?? ""];
  });
}

function finalTexts(item: string): Array<[string, string]> {
  return PLAYGROUND_LANGUAGES.map((code) => [code, PLAYGROUND_TRANSLATIONS[code]?.[item] ?? ""]);
}

describe("the playground on the server", () => {
  it("renders the split h2 before the island, never inside it", async () => {
    const root = await renderServer();
    expect(root.querySelector("section#playground h2#playground-heading")?.textContent).toBe(
      copy.heading,
    );
    const head = root.querySelector(
      "section#playground.vk-band .vk-playground-layout",
    )?.firstElementChild;
    expect(head?.getAttribute("data-layout")).toBe("split");
    expect(head?.nextElementSibling?.querySelector("[data-playground-demo]")).not.toBeNull();
    expect(root.querySelector("[data-playground-demo] h2")).toBeNull();
    expect(root.querySelector("h1")).toBeNull();
  });

  it("renders the default item fully settled, so the first client render matches it", async () => {
    const root = await renderServer();
    const element = demo(root);
    expect(element.dataset.item).toBe(PLAYGROUND_DEFAULT_ITEM);
    expect(element.dataset.phase).toBe("done");
    expect(srTexts(root)).toEqual(finalTexts(PLAYGROUND_DEFAULT_ITEM));
    const visible = rows(root).map((row) => row.querySelector(".vk-playground-live")?.textContent);
    expect(visible).toEqual(
      PLAYGROUND_LANGUAGES.map((code) => PLAYGROUND_TRANSLATIONS[code]?.[PLAYGROUND_DEFAULT_ITEM]),
    );
  });

  it("marks each placeholder in every language and keeps it verbatim", async () => {
    const root = await renderServer();
    const welcome = rows(root).map((row) => [
      ...row.querySelectorAll(".vk-playground-live .vk-ph"),
    ]);
    for (const marked of welcome) {
      expect(marked.map((node) => node.textContent)).toEqual(["{name}"]);
    }
    expect(root.querySelector(".vk-playground-source-text .vk-ph")?.textContent).toBe("{name}");
  });

  it("hides every animated text from assistive technology and keeps real translations in lang spans", async () => {
    const root = await renderServer();
    for (const row of rows(root)) {
      expect(row.querySelector(".vk-playground-sizers")?.getAttribute("aria-hidden")).toBe("true");
      expect(row.querySelector(".sr-only")?.getAttribute("lang")).not.toBeNull();
    }
    expect(root.querySelector(".vk-playground-source-text")?.getAttribute("aria-hidden")).toBe(
      "true",
    );
    expect(root.querySelector(".vk-playground-source .sr-only")?.getAttribute("lang")).toBe("en");
  });

  it("offers the picks and languages as pressed-state buttons in named fieldsets", async () => {
    const root = await renderServer();
    expect(picks(root).map((button) => button.textContent)).toEqual(
      PLAYGROUND_PICKS.map((item) => item.text),
    );
    expect(picks(root).map((button) => button.getAttribute("aria-pressed"))).toEqual(
      PLAYGROUND_PICKS.map((item) => String(item.id === PLAYGROUND_DEFAULT_ITEM)),
    );
    expect(rows(root).map((button) => button.getAttribute("aria-pressed"))).toEqual(
      PLAYGROUND_LANGUAGES.map(() => "false"),
    );
    expect(root.querySelector(".vk-playground-picks legend")?.textContent).toBe(copy.items);
    expect(root.querySelector(".vk-playground-rows legend")?.textContent).toBe(copy.languages);
    for (const button of root.querySelectorAll("button")) {
      expect(button.getAttribute("type")).toBe("button");
    }
  });

  it("derives the counters and the integrity line from the data", async () => {
    const root = await renderServer();
    const counters = root.querySelector(".vk-playground-counters")?.textContent ?? "";
    expect(counters).toContain(`${copy.counters.sent} 1`);
    expect(counters).toContain(`${copy.counters.kept} ${PLAYGROUND_KEPT_STRINGS}`);
    expect(PLAYGROUND_KEPT_STRINGS).toBe(PLAYGROUND_ITEMS.length - 1);
    const welcome = PLAYGROUND_PICKS.find((item) => item.id === PLAYGROUND_DEFAULT_ITEM);
    const { intact, total } = intactPlaceholders(
      welcome?.text ?? "",
      PLAYGROUND_LANGUAGES.map(
        (code) => PLAYGROUND_TRANSLATIONS[code]?.[PLAYGROUND_DEFAULT_ITEM] ?? "",
      ),
    );
    expect(counters).toContain(`${intact}/${total}`);
    expect(root.querySelector(".vk-playground-status-text .vk-playground-live")?.textContent).toBe(
      copy.status.passed.replace("{intact}", String(intact)).replace("{total}", String(total)),
    );
  });

  it("shows the translate() run as resolved with a full bar", async () => {
    const root = await renderServer();
    expect(root.querySelector(".vk-playground-run .vk-playground-live")?.textContent).toBe(
      copy.run.resolved,
    );
    expect(root.querySelector<HTMLElement>(".vk-playground-bar > span")?.style.width).toBe("100%");
  });

  it("shows the SDK snippet with every language line and the copy control", async () => {
    const root = await renderServer();
    const code = root.querySelector("figure pre")?.textContent ?? "";
    expect(code).toBe(PLAYGROUND_SNIPPET);
    expect(root.querySelectorAll("[data-snippet-locale]")).toHaveLength(
      PLAYGROUND_LANGUAGES.length,
    );
    expect(root.querySelector("figure button")?.textContent).toBe(messages.landing.install.copy);
  });

  it("keeps exactly one polite live region, empty until a visitor acts", async () => {
    const root = await renderServer();
    const regions = liveRegions(root);
    expect(regions).toHaveLength(1);
    expect(regions[0]?.getAttribute("aria-live")).toBe("polite");
    expect(regions[0]?.textContent).toBe("");
  });

  it("keeps the static table of every result for visitors without scripting", async () => {
    const root = await renderServer();
    const table = root.querySelector(".vk-playground-static table");
    expect(table?.querySelectorAll("tbody tr")).toHaveLength(PLAYGROUND_ITEMS.length);
    expect(table?.querySelector('td[lang="ja"]')?.textContent).toBe(
      PLAYGROUND_TRANSLATIONS.ja?.[PLAYGROUND_ITEMS[0]?.id ?? ""],
    );
  });

  it("renders the translated chrome in every locale", async () => {
    for (const locale of ["de", "es", "fr"]) {
      const root = await renderServer(locale);
      expect(root.querySelector("#playground-heading")?.textContent).not.toBe(copy.heading);
      expect(
        root.querySelector(".vk-playground-status-text .vk-playground-live")?.textContent,
      ).not.toBe("");
    }
  });
});

describe("the playground hydration", () => {
  it("hydrates the server markup without a mismatch and without changing it", async () => {
    page.locale = "en";
    const node = await Playground();
    const host = document.createElement("div");
    document.body.append(host);
    host.innerHTML = renderToString(node);
    const before = host.innerHTML;
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    let root: Root | undefined;
    await act(async () => {
      root = hydrateRoot(host, node);
    });
    expect(errors.mock.calls.map((call) => call.slice(1).join(" "))).toEqual([]);
    expect(host.innerHTML).toBe(before);
    errors.mockRestore();
    if (root !== undefined) mounted.push({ root, host });
  });
});

describe("the playground animation", () => {
  it("stays settled until it scrolls into view", async () => {
    const root = await mount();
    await advance(5000);
    expect(demo(root).dataset.phase).toBe("done");
    expect(demo(root).dataset.item).toBe(PLAYGROUND_DEFAULT_ITEM);
  });

  it("holds the default item, then types and decodes the next one when in view", async () => {
    const root = await mount();
    await enterView();
    expect(demo(root).dataset.playing).toBe("");
    await advance(HOLD_MS + 200);
    const second = PLAYGROUND_PICKS[1];
    expect(demo(root).dataset.item).toBe(second?.id);
    expect(demo(root).dataset.phase).toBe("typing");
    await advance(sceneMs(1) / 2);
    expect(demo(root).dataset.phase).toBe("running");
    expect(rows(root).some((row) => row.hasAttribute("data-selected"))).toBe(true);
    await advance(sceneMs(1));
    expect(demo(root).dataset.phase).toBe("done");
    expect(srTexts(root)).toEqual(finalTexts(second?.id ?? ""));
  });

  it("keeps the real translations in the DOM while the visible text decodes", async () => {
    const root = await mount();
    await enterView();
    await advance(HOLD_MS + 200);
    await advance(sceneMs(1) / 2);
    expect(srTexts(root)).toEqual(finalTexts(PLAYGROUND_PICKS[1]?.id ?? ""));
    expect(liveRegions(root)[0]?.textContent).toBe("");
  });

  it("pauses while offscreen and resumes in view", async () => {
    const root = await mount();
    await enterView();
    await leaveView();
    await advance(HOLD_MS * 3);
    expect(demo(root).dataset.item).toBe(PLAYGROUND_DEFAULT_ITEM);
    await enterView();
    await advance(HOLD_MS + 200);
    expect(demo(root).dataset.item).toBe(PLAYGROUND_PICKS[1]?.id);
  });

  it("pauses while the tab is hidden", async () => {
    const root = await mount();
    await enterView();
    hidden = true;
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await advance(HOLD_MS * 3);
    expect(demo(root).dataset.item).toBe(PLAYGROUND_DEFAULT_ITEM);
    hidden = false;
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await advance(HOLD_MS + 200);
    expect(demo(root).dataset.item).toBe(PLAYGROUND_PICKS[1]?.id);
  });

  it("stops for good when a visitor picks a string, plays it once and announces every language", async () => {
    const root = await mount();
    await enterView();
    const target = picks(root)[2];
    await act(async () => target?.click());
    expect(demo(root).dataset.item).toBe(PLAYGROUND_PICKS[2]?.id);
    expect(demo(root).dataset.playing).toBeUndefined();
    expect(target?.getAttribute("aria-pressed")).toBe("true");
    const live = liveRegions(root)[0];
    for (const code of PLAYGROUND_LANGUAGES) {
      expect(live?.querySelector(`[lang="${code}"]`)?.textContent).toBe(
        PLAYGROUND_TRANSLATIONS[code]?.[PLAYGROUND_PICKS[2]?.id ?? ""],
      );
    }
    await advance(sceneMs(2) + 100);
    expect(demo(root).dataset.phase).toBe("done");
    await advance(HOLD_MS * 4);
    expect(demo(root).dataset.item).toBe(PLAYGROUND_PICKS[2]?.id);
  });

  it("selecting a language marks it, lights its code line and announces only that language", async () => {
    const root = await mount();
    await enterView();
    const row = rows(root)[1];
    await act(async () => row?.click());
    expect(row?.getAttribute("aria-pressed")).toBe("true");
    expect(row?.hasAttribute("data-selected")).toBe(true);
    const code = PLAYGROUND_LANGUAGES[1] ?? "";
    expect(demo(root).style.getPropertyValue(`--vk-snippet-hot-${code}`)).toBe(
      "var(--vk-hot-fill)",
    );
    expect(demo(root).dataset.playing).toBeUndefined();
    const live = liveRegions(root)[0];
    expect(live?.querySelectorAll("[lang]")).toHaveLength(1);
    expect(live?.querySelector(`[lang="${code}"]`)?.textContent).toBe(
      PLAYGROUND_TRANSLATIONS[code]?.[PLAYGROUND_DEFAULT_ITEM],
    );
    await act(async () => row?.click());
    expect(row?.getAttribute("aria-pressed")).toBe("false");
  });

  it("offers a pause control that settles the scene and a play control that resumes", async () => {
    const root = await mount();
    await enterView();
    expect(pause(root).getAttribute("aria-label")).toBe(copy.animation.pause);
    await advance(HOLD_MS + 600);
    await act(async () => pause(root).click());
    expect(pause(root).getAttribute("aria-label")).toBe(copy.animation.play);
    expect(demo(root).dataset.phase).toBe("done");
    const item = demo(root).dataset.item;
    await advance(HOLD_MS * 4);
    expect(demo(root).dataset.item).toBe(item);
    await act(async () => pause(root).click());
    expect(pause(root).getAttribute("aria-label")).toBe(copy.animation.pause);
    await advance(HOLD_MS + 200);
    expect(demo(root).dataset.item).not.toBe(item);
  });

  it("cycles back to the first string after the last", async () => {
    const root = await mount();
    await enterView();
    let elapsed = HOLD_MS + 200;
    await advance(elapsed);
    for (let index = 1; index < PLAYGROUND_PICKS.length; index++) {
      elapsed = sceneMs(index) + HOLD_MS + 200;
      await advance(elapsed);
    }
    expect(demo(root).dataset.item).toBe(PLAYGROUND_PICKS[0]?.id);
  });
});

describe("the playground under reduced motion", () => {
  it("stays on the final state, never types and never cycles", async () => {
    reduced = true;
    const root = await mount();
    await enterView();
    await advance(60_000);
    expect(demo(root).dataset.phase).toBe("done");
    expect(demo(root).dataset.item).toBe(PLAYGROUND_DEFAULT_ITEM);
    expect(demo(root).dataset.playing).toBeUndefined();
    expect(srTexts(root)).toEqual(finalTexts(PLAYGROUND_DEFAULT_ITEM));
  });

  it("still lets a visitor pick a string and shows its final translations at once", async () => {
    reduced = true;
    const root = await mount();
    await act(async () => picks(root)[1]?.click());
    expect(demo(root).dataset.item).toBe(PLAYGROUND_PICKS[1]?.id);
    expect(demo(root).dataset.phase).toBe("done");
    await advance(TICK_MS);
    expect(srTexts(root)).toEqual(finalTexts(PLAYGROUND_PICKS[1]?.id ?? ""));
  });

  it("settles a running scene when reduced motion is switched on while it plays", async () => {
    const root = await mount();
    await enterView();
    await advance(HOLD_MS + 500);
    expect(demo(root).dataset.phase).not.toBe("done");
    reduced = true;
    await act(async () => {
      for (const listener of motionListeners) listener();
    });
    await advance(TICK_MS * 4);
    expect(demo(root).dataset.phase).toBe("done");
    expect(demo(root).dataset.playing).toBeUndefined();
    const item = demo(root).dataset.item;
    await advance(60_000);
    expect(demo(root).dataset.item).toBe(item);
  });

  it("starts moving when reduced motion is switched off", async () => {
    reduced = true;
    const root = await mount();
    await enterView();
    reduced = false;
    await act(async () => {
      for (const listener of motionListeners) listener();
    });
    await enterView();
    await advance(HOLD_MS + 500);
    expect(demo(root).dataset.playing).toBe("");
  });

  it("hides the pause control and the caret with CSS, not with script", () => {
    const rules = docsStylesheetRules();
    for (const selector of [
      ".vk-playground-pause",
      ".vk-playground-source-text .vk-playground-live::after",
    ]) {
      const hidden = rulesFor(rules, selector).find(
        (rule) => rule.media.includes("reduce") && rule.declarations.display === "none",
      );
      expect(hidden, selector).toBeDefined();
    }
  });
});
