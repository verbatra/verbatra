// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { act, type ReactNode, type Ref, useImperativeHandle } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { i18n } from "@/lib/i18n";
import {
  PLAYGROUND_DEFAULT_ITEM,
  PLAYGROUND_ITEMS,
  PLAYGROUND_LANGUAGES,
  PLAYGROUND_METADATA,
  PLAYGROUND_SNIPPET,
  PLAYGROUND_TRANSLATIONS,
} from "@/lib/landing-playground";
import committed from "@/lib/playground/translations.json";
import { docsStylesheetRules, rulesFor } from "@/lib/stylesheet-rules";
import messages from "@/messages/en.json";
import { contrast, themeTokens } from "@/test-support/contrast";
import { preloadRegisteredIslands } from "@/test-support/islands";
import type { ScrambleController, ScrambleRow } from "./playground-scramble";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const page = vi.hoisted(() => ({ locale: "en" }));

const scramble = vi.hoisted(() => ({
  plays: [] as Array<{ rows: ReadonlyArray<ScrambleRow>; done: () => void }>,
  loads: 0,
  renders: 0,
  stops: 0,
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
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

vi.mock("./playground-scramble", () => {
  scramble.loads += 1;
  return {
    Scrambler: ({ controller }: { controller: Ref<ScrambleController> }) => {
      scramble.renders += 1;
      useImperativeHandle(controller, () => ({
        play: (rows, done) => {
          scramble.plays.push({ rows, done });
        },
        stop: () => {
          scramble.stops += 1;
        },
      }));
      return null;
    },
  };
});

const { Playground } = await import("./playground");
const { createScramblerLoader, loadScrambler, SCRAMBLER_WAIT_MS } = await import(
  "./playground-demo"
);

await preloadRegisteredIslands();

const copy = messages.landing.playground;

let reduced = false;

beforeEach(() => {
  reduced = false;
  scramble.plays.length = 0;
  scramble.renders = 0;
  scramble.stops = 0;
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      matches: query.includes("reduce") ? reduced : !reduced,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
    }),
  });
});

async function renderServer(locale = "en"): Promise<HTMLElement> {
  page.locale = locale;
  const container = document.createElement("div");
  container.innerHTML = renderToString(await Playground());
  return container;
}

const mounted: Array<{ root: Root; host: HTMLElement }> = [];

afterEach(() => {
  for (const { root, host } of mounted.splice(0)) {
    act(() => root.unmount());
    host.remove();
  }
});

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

function radios(root: ParentNode): HTMLInputElement[] {
  return [...root.querySelectorAll<HTMLInputElement>('input[type="radio"]')];
}

function checkboxes(root: ParentNode): HTMLInputElement[] {
  return [...root.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
}

function liveRegions(root: ParentNode): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>("[aria-live]")].filter(
    (region) => region.closest("figure") === null,
  );
}

function resultValues(root: ParentNode): Array<[string | null, string]> {
  return [
    ...root.querySelectorAll(".vk-playground-result:not([data-empty]) .vk-playground-result-text"),
  ].map((node) => [node.getAttribute("lang"), node.textContent ?? ""]);
}

function translateButton(root: ParentNode): HTMLButtonElement {
  const button = [...root.querySelectorAll("button")].find(
    (candidate) => candidate.textContent === copy.translate,
  );
  if (button === undefined) throw new Error("no Translate button");
  return button;
}

async function click(element: HTMLElement): Promise<void> {
  await act(async () => {
    element.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function expected(item: string, languages: ReadonlyArray<string>): Array<[string, string]> {
  return languages.map((code) => [code, PLAYGROUND_TRANSLATIONS[code]?.[item] ?? ""]);
}

describe("the playground on the server", () => {
  it("opens with a stacked h2 and the demo, never a second h1", async () => {
    const root = await renderServer();
    expect(root.querySelector("section#playground h2#playground-heading")?.textContent).toBe(
      copy.heading,
    );
    expect(root.querySelector("h1")).toBeNull();
  });

  it("offers every source string as a native radio in one named fieldset, with the default picked", async () => {
    const root = await renderServer();
    const group = radios(root);
    expect(group.map((input) => input.value)).toEqual(PLAYGROUND_ITEMS.map((item) => item.id));
    expect(new Set(group.map((input) => input.name)).size).toBe(1);
    expect(group.filter((input) => input.checked).map((input) => input.value)).toEqual([
      PLAYGROUND_DEFAULT_ITEM,
    ]);
    const fieldset = group[0]?.closest("fieldset");
    expect(fieldset?.querySelector("legend")?.textContent).toBe(copy.items);
    for (const input of group) {
      expect(input.closest("fieldset")).toBe(fieldset);
      const label = input.closest("label");
      expect(label?.querySelector('[lang="en"]')?.textContent).toBe(
        PLAYGROUND_ITEMS.find((item) => item.id === input.value)?.text,
      );
    }
  });

  it("offers every language as a native checkbox in its own named fieldset, all checked", async () => {
    const root = await renderServer();
    const boxes = checkboxes(root);
    expect(boxes.map((input) => input.value)).toEqual([...PLAYGROUND_LANGUAGES]);
    expect(PLAYGROUND_LANGUAGES).toContain("ja");
    expect(boxes.every((input) => input.checked)).toBe(true);
    const fieldset = boxes[0]?.closest("fieldset");
    expect(fieldset?.querySelector("legend")?.textContent).toBe(copy.languages);
    expect(fieldset).not.toBe(radios(root)[0]?.closest("fieldset"));
    expect(boxes.map((input) => input.closest("label")?.textContent)).toEqual(
      PLAYGROUND_LANGUAGES.map(
        (code) => copy.languageNames[code as keyof typeof copy.languageNames],
      ),
    );
  });

  it("keeps the Translate control a plain button, so nothing submits before hydration", async () => {
    const root = await renderServer();
    expect(root.querySelector("form")).toBeNull();
    expect(translateButton(root).getAttribute("type")).toBe("button");
  });

  it("lists one result row per language, each value marked with its own lang, ja included", async () => {
    const root = await renderServer();
    expect(resultValues(root)).toEqual(expected(PLAYGROUND_DEFAULT_ITEM, PLAYGROUND_LANGUAGES));
    for (const scrambler of root.querySelectorAll(".vk-playground-scramble")) {
      expect(scrambler.getAttribute("aria-hidden")).toBe("true");
      expect(scrambler.textContent).toBe("");
    }
    expect(root.querySelector('.vk-playground-result [lang="ja"]')).not.toBeNull();
  });

  it("renders the translations as plain text", async () => {
    const source = readFileSync(join(import.meta.dirname, "playground-demo.tsx"), "utf8");
    expect(source).not.toContain("dangerouslySetInnerHTML");
    expect(readFileSync(join(import.meta.dirname, "playground.tsx"), "utf8")).not.toContain(
      "dangerouslySetInnerHTML",
    );
  });

  it("holds one polite live region for the result, empty until a run settles", async () => {
    const root = await renderServer();
    const regions = liveRegions(root);
    expect(regions).toHaveLength(1);
    expect(regions[0]?.getAttribute("aria-live")).toBe("polite");
    expect(regions[0]?.className).toContain("sr-only");
    expect(regions[0]?.textContent).toBe("");
  });

  it("states that the results are pre-generated, in exactly the agreed words", async () => {
    const root = await renderServer();
    expect(root.querySelector(".vk-playground-label")?.textContent).toBe(
      "Pre-generated with the Verbatra SDK and Gemini, not live.",
    );
  });

  it("reads the provider, model and generation date from the committed JSON", async () => {
    const root = await renderServer();
    const meta = root.querySelector(".vk-playground-meta");
    const values = [...(meta?.querySelectorAll("dd") ?? [])].map((dd) => dd.textContent);
    expect(PLAYGROUND_METADATA).toEqual(committed.metadata);
    expect(values[0]).toBe("Gemini");
    expect(values[1]).toBe(committed.metadata.model);
    expect(meta?.querySelector("time")?.getAttribute("datetime")).toBe(
      committed.metadata.generatedAt.slice(0, 10),
    );
    expect(values[2]).toBe(
      new Intl.DateTimeFormat("en", { dateStyle: "long", timeZone: "UTC" }).format(
        new Date(committed.metadata.generatedAt),
      ),
    );
  });

  it("links the SDK quickstart, the SDK reference and the providers page in the page's locale", async () => {
    const root = await renderServer("de");
    const hrefs = [...root.querySelectorAll(".vk-playground-links a")].map((a) =>
      a.getAttribute("href"),
    );
    expect(hrefs).toEqual(["/de/docs/sdk-quickstart", "/de/docs/sdk", "/de/docs/providers"]);
  });

  it("keeps the demo content identical in every locale", async () => {
    const english = await renderServer("en");
    for (const locale of i18n.languages) {
      const root = await renderServer(locale);
      expect(radios(root).map((input) => input.closest("label")?.textContent)).toEqual(
        radios(english).map((input) => input.closest("label")?.textContent),
      );
      expect(resultValues(root)).toEqual(resultValues(english));
      expect(root.querySelector(".vk-playground-table tbody")?.innerHTML).toBe(
        english.querySelector(".vk-playground-table tbody")?.innerHTML,
      );
    }
  });
});

describe("the displayed SDK snippet", () => {
  it("is server-highlighted and shows exactly the snippet text", async () => {
    const root = await renderServer();
    const pre = root.querySelector("figure pre.shiki");
    expect(pre?.className).toContain("github-light github-dark");
    expect(pre?.textContent).toBe(PLAYGROUND_SNIPPET);
    expect(root.querySelector("figure figcaption")?.textContent).toBe("translate.ts");
  });

  it("displayed config parses through the public sdk schema and loads", async () => {
    const root = await renderServer();
    const text = root.querySelector("figure pre.shiki")?.textContent ?? "";
    const start = text.indexOf("defineConfig(") + "defineConfig(".length;
    const end = text.indexOf("\n  }),\n});");
    const config: unknown = runInNewContext(`(${text.slice(start, end + 4)})`);
    const sdk = await import("@verbatra/sdk");
    expect(sdk.verbatraConfigSchema.safeParse(config).success).toBe(true);
    const loaded = await sdk.loadConfig({ configOverride: sdk.defineConfig(config as never) });
    expect(loaded.targetLocales).toEqual([...PLAYGROUND_LANGUAGES]);
    expect(loaded.provider).toMatchObject({
      id: committed.metadata.provider,
      options: { model: committed.metadata.model },
    });
    expect(text).toContain("const summary = await translate({ config });");
    expect(text).toMatch(
      /^import \{ defineConfig, loadConfig, translate \} from "@verbatra\/sdk";/,
    );
  });
});

describe("the playground without JavaScript", () => {
  it("server-renders a captioned table of every source string and language", async () => {
    const root = await renderServer();
    const table = root.querySelector(".vk-playground-static table");
    const caption = table?.querySelector("caption");
    expect(caption?.textContent).toBe(copy.table.caption);
    expect(table?.closest("[aria-labelledby]")?.getAttribute("aria-labelledby")).toBe(caption?.id);
    const columns = [...(table?.querySelectorAll('thead th[scope="col"]') ?? [])];
    expect(columns.map((th) => th.textContent)).toEqual([
      copy.table.source,
      ...PLAYGROUND_LANGUAGES.map(
        (code) => copy.languageNames[code as keyof typeof copy.languageNames],
      ),
    ]);
    const rows = [...(table?.querySelectorAll("tbody tr") ?? [])];
    expect(rows).toHaveLength(PLAYGROUND_ITEMS.length);
    rows.forEach((row, index) => {
      const item = PLAYGROUND_ITEMS[index];
      const header = row.querySelector('th[scope="row"]');
      expect(header?.getAttribute("lang")).toBe("en");
      expect(header?.textContent).toBe(item?.text);
      expect(
        [...row.querySelectorAll("td")].map((td) => [td.getAttribute("lang"), td.textContent]),
      ).toEqual(expected(item?.id ?? "", PLAYGROUND_LANGUAGES));
    });
  });

  it("shows the table only without scripting, and hides the controls and results there", () => {
    const rules = docsStylesheetRules();
    const base = rulesFor(rules, ".vk-playground-static").filter((rule) => rule.media === "");
    expect(base.some((rule) => rule.declarations.display === "none")).toBe(true);
    const none = rules.filter((rule) => rule.media === "@media (scripting: none)");
    const display = (selector: string) =>
      none.find((rule) => rule.selector.split(/,\s*/).includes(selector))?.declarations.display;
    expect(display(".vk-playground-static")).toBe("block");
    expect(display(".vk-playground-controls")).toBe("none");
    expect(display(".vk-playground-result-block")).toBe("none");
  });
});

describe("the playground controls", () => {
  const rules = docsStylesheetRules();

  it("gives every option a target of at least 24px", () => {
    const option = rulesFor(rules, ".vk-playground-option").find((rule) => rule.media === "");
    expect(
      Number.parseFloat(option?.declarations["min-height"] ?? "0") * 16,
    ).toBeGreaterThanOrEqual(24);
  });

  it.each(["dark", "light"] as const)(
    "draws each control's boundary and checked fill at 3:1 or more in the %s theme",
    (theme) => {
      const input = rulesFor(rules, ".vk-playground-input").find((rule) => rule.media === "");
      const border = /var\((--[\w-]+)\)/.exec(input?.declarations.border ?? "")?.[1];
      expect(border).toBe("--text-faint");
      const checked = rulesFor(rules, ".vk-playground-input:checked")[0]?.declarations;
      const fill = /var\((--[\w-]+)\)/.exec(checked?.background ?? "")?.[1] ?? "";
      const tokens = themeTokens()[theme];
      expect(contrast(tokens, border ?? "", "--surface-bg")).toBeGreaterThanOrEqual(3);
      expect(contrast(tokens, fill, "--surface-bg")).toBeGreaterThanOrEqual(3);
    },
  );

  it("colors the scramble text with the accent text token only", () => {
    const scrambler = rulesFor(rules, ".vk-playground-scramble").find(
      (rule) => rule.declarations.color !== undefined,
    );
    expect(scrambler?.declarations.color).toBe("var(--accent)");
  });
});

describe("the playground in the browser", () => {
  it("swaps the texts at once under reduced motion and announces them once, without loading the animation", async () => {
    reduced = true;
    const loadsBefore = scramble.loads;
    const root = await mount();
    const save = radios(root).find((input) => input.value === "save");
    const french = checkboxes(root).find((input) => input.value === "fr");
    if (save === undefined || french === undefined) throw new Error("missing controls");
    await click(save);
    await click(french);
    expect(resultValues(root)).toEqual(expected(PLAYGROUND_DEFAULT_ITEM, PLAYGROUND_LANGUAGES));

    await click(translateButton(root));
    const languages = PLAYGROUND_LANGUAGES.filter((code) => code !== "fr");
    expect(resultValues(root)).toEqual(expected("save", languages));
    expect(root.querySelector(".vk-playground-results")?.hasAttribute("data-scrambling")).toBe(
      false,
    );
    const region = liveRegions(root)[0];
    expect(liveRegions(root)).toHaveLength(1);
    for (const [code, text] of expected("save", languages)) {
      expect(region?.querySelector(`[lang="${code}"]`)?.textContent).toBe(text);
    }
    expect(scramble.plays).toHaveLength(0);
    expect(scramble.loads).toBe(loadsBefore);
  });

  it("scrambles each row from the source to its translation, then announces once the animation ends", async () => {
    const root = await mount();
    await click(translateButton(root));
    expect(scramble.plays).toHaveLength(1);
    const play = scramble.plays[0];
    const source = PLAYGROUND_ITEMS.find((item) => item.id === PLAYGROUND_DEFAULT_ITEM)?.text;
    expect(play?.rows.map((row) => [row.lang, row.from, row.to])).toEqual(
      expected(PLAYGROUND_DEFAULT_ITEM, PLAYGROUND_LANGUAGES).map(([code, text]) => [
        code,
        source,
        text,
      ]),
    );
    const list = root.querySelector(".vk-playground-results");
    expect(list?.hasAttribute("data-scrambling")).toBe(true);
    expect(liveRegions(root)[0]?.textContent).toBe("");

    await act(async () => play?.done());
    expect(list?.hasAttribute("data-scrambling")).toBe(false);
    expect(liveRegions(root)[0]?.textContent).toContain(
      PLAYGROUND_TRANSLATIONS.ja?.[PLAYGROUND_DEFAULT_ITEM],
    );
  });

  it("lets a new click win over a run that is still animating", async () => {
    const root = await mount();
    await click(translateButton(root));
    const settings = radios(root).find((input) => input.value === "settings");
    if (settings === undefined) throw new Error("no settings radio");
    await click(settings);
    await click(translateButton(root));
    expect(scramble.plays).toHaveLength(2);

    await act(async () => scramble.plays[0]?.done());
    expect(liveRegions(root)[0]?.textContent).toBe("");
    expect(root.querySelector(".vk-playground-results")?.hasAttribute("data-scrambling")).toBe(
      true,
    );

    await act(async () => scramble.plays[1]?.done());
    expect(resultValues(root)).toEqual(expected("settings", PLAYGROUND_LANGUAGES));
    expect(liveRegions(root)[0]?.textContent).toContain(PLAYGROUND_TRANSLATIONS.de?.settings);
  });

  it("ends a running scramble when the next press has no language to show", async () => {
    const root = await mount();
    await click(translateButton(root));
    const list = root.querySelector(".vk-playground-results");
    expect(list?.hasAttribute("data-scrambling")).toBe(true);
    for (const box of checkboxes(root)) await click(box);
    expect(scramble.stops).toBe(0);
    await click(translateButton(root));
    expect(scramble.stops).toBe(1);
    expect(list?.hasAttribute("data-scrambling")).toBe(false);
    await act(async () => scramble.plays[0]?.done());
    expect(liveRegions(root)[0]?.textContent).toBe(copy.noLanguages);
  });

  it("asks for a language when none is checked and keeps the last result", async () => {
    reduced = true;
    const root = await mount();
    for (const box of checkboxes(root)) await click(box);
    await click(translateButton(root));
    expect(liveRegions(root)[0]?.textContent).toBe(copy.noLanguages);
    expect(resultValues(root)).toEqual(expected(PLAYGROUND_DEFAULT_ITEM, PLAYGROUND_LANGUAGES));
  });
});

describe("the scramble module loader", () => {
  it("caches one load, drops a failed one so the next call imports again, then keeps the success", async () => {
    const load = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("chunk failed"))
      .mockResolvedValue("scrambler");
    const loader = createScramblerLoader(load);
    const first = loader();
    expect(loader()).toBe(first);
    await expect(first).rejects.toThrow("chunk failed");
    expect(load).toHaveBeenCalledTimes(1);
    await expect(loader()).resolves.toBe("scrambler");
    expect(load).toHaveBeenCalledTimes(2);
    await expect(loader()).resolves.toBe("scrambler");
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("waits SCRAMBLER_WAIT_MS for the module and loads the real Scrambler", async () => {
    expect(SCRAMBLER_WAIT_MS).toBe(800);
    await expect(loadScrambler()).resolves.toBeTypeOf("function");
  });
});

describe("the playground warm-up", () => {
  function demo(root: ParentNode): HTMLElement {
    const element = root.querySelector<HTMLElement>("[data-playground-demo]");
    if (element === null) throw new Error("no demo root");
    return element;
  }

  it.each([
    [
      "a pointer entering",
      (root: HTMLElement) =>
        demo(root).dispatchEvent(new MouseEvent("pointerover", { bubbles: true })),
    ],
    ["focus moving in", (root: HTMLElement) => radios(root)[0]?.focus()],
    [
      "a touch starting",
      (root: HTMLElement) => demo(root).dispatchEvent(new Event("touchstart", { bubbles: true })),
    ],
  ])("loads and mounts the scrambler on %s, before any press", async (_, enter) => {
    const root = await mount();
    expect(scramble.renders).toBe(0);
    await act(async () => {
      enter(root);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(scramble.renders).toBeGreaterThan(0);
    expect(scramble.plays).toHaveLength(0);
  });

  it("loads nothing on a pointer entering under reduced motion", async () => {
    reduced = true;
    const root = await mount();
    await act(async () => {
      demo(root).dispatchEvent(new MouseEvent("pointerover", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(scramble.renders).toBe(0);
  });
});

describe("the playground on a cold press", () => {
  it("marks the results busy and the button disabled at once, ignoring a second press while it waits", async () => {
    const root = await mount();
    const button = translateButton(root);
    const block = root.querySelector(".vk-playground-result-block");
    expect(block?.hasAttribute("aria-busy")).toBe(false);
    act(() => button.click());
    expect(block?.getAttribute("aria-busy")).toBe("true");
    expect(button.getAttribute("aria-disabled")).toBe("true");
    expect(button.disabled).toBe(false);
    act(() => button.click());
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(scramble.plays).toHaveLength(1);
    expect(button.hasAttribute("aria-disabled")).toBe(false);
    expect(block?.getAttribute("aria-busy")).toBe("true");
    await act(async () => scramble.plays[0]?.done());
    expect(block?.hasAttribute("aria-busy")).toBe(false);
  });

  it("keeps one slot per language in a fixed order, sized by that language's translations, and labels the unselected one", async () => {
    reduced = true;
    const root = await mount();
    const french = checkboxes(root).find((input) => input.value === "fr");
    if (french === undefined) throw new Error("no fr checkbox");
    await click(french);
    await click(translateButton(root));
    const slots = [...root.querySelectorAll<HTMLElement>(".vk-playground-result")];
    expect(slots.map((slot) => slot.dataset.lang)).toEqual([...PLAYGROUND_LANGUAGES]);
    const empty = slots.filter((slot) => slot.hasAttribute("data-empty"));
    expect(empty.map((slot) => slot.dataset.lang)).toEqual(["fr"]);
    expect(empty[0]?.getAttribute("aria-hidden")).toBe("true");
    expect(empty[0]?.querySelector(".vk-playground-result-empty")?.textContent).toBe(
      messages.landing.playground.notSelected,
    );
    expect(empty[0]?.querySelector(".vk-playground-result-text")).toBeNull();
    for (const slot of slots) {
      const sized = [...slot.querySelectorAll(".vk-playground-sizer")].map(
        (node) => node.textContent,
      );
      const own = Object.values(PLAYGROUND_TRANSLATIONS[slot.dataset.lang ?? ""] ?? {});
      expect(new Set(sized)).toEqual(new Set(own));
    }
    const sources = [...root.querySelectorAll(".vk-playground-source .vk-playground-sizer")].map(
      (node) => node.textContent,
    );
    expect(sources).toEqual(PLAYGROUND_ITEMS.map((item) => item.text));
  });

  it("dims the results with a visible hint once the selection differs from what they show, until Translate", async () => {
    reduced = true;
    const root = await mount();
    const block = root.querySelector<HTMLElement>(".vk-playground-result-block");
    const hint = block?.querySelector(".vk-playground-stale");
    expect(hint?.textContent).toBe(messages.landing.playground.stale);
    expect(hint?.closest("[aria-live]")).toBeNull();
    expect(block?.hasAttribute("data-stale")).toBe(false);
    const french = checkboxes(root).find((input) => input.value === "fr");
    if (french === undefined) throw new Error("no fr checkbox");
    await click(french);
    expect(block?.hasAttribute("data-stale")).toBe(true);
    expect(root.querySelector("[data-playground-live]")?.textContent).toBe("");
    await click(translateButton(root));
    expect(block?.hasAttribute("data-stale")).toBe(false);
  });

  it("writes the snippet's target locales from the checked languages and copies what it shows", async () => {
    reduced = true;
    const root = await mount();
    const code = root.querySelector<HTMLElement>(".vk-playground-code");
    const hidden = () =>
      [...root.querySelectorAll<HTMLElement>(".vk-playground-code [data-snippet-locale]")]
        .filter(
          (line) =>
            code?.style.getPropertyValue(`--vk-snippet-${line.dataset.snippetLocale}`) === "none",
        )
        .map((line) => line.dataset.snippetLocale);
    expect(hidden()).toEqual([]);
    const french = checkboxes(root).find((input) => input.value === "fr");
    if (french === undefined) throw new Error("no fr checkbox");
    await click(french);
    expect(hidden()).toEqual(["fr"]);
    const writes: string[] = [];
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async (text: string) => void writes.push(text) },
    });
    const copy = root.querySelector<HTMLButtonElement>(".vk-playground-code figure button");
    if (copy === null) throw new Error("no copy button");
    await click(copy);
    expect(writes).toHaveLength(1);
    expect(writes[0]).toContain('"de",');
    expect(writes[0]).not.toContain('"fr",');
    for (const box of checkboxes(root).filter((input) => input.checked)) await click(box);
    expect(hidden()).toEqual([]);
  });
});

describe("the playground taking over server markup", () => {
  it("keeps the selection and the focus a visitor set before the island loaded", async () => {
    reduced = true;
    const server = await renderServer();
    document.body.append(server);
    const settings = radios(server).find((input) => input.value === "settings");
    const spanish = checkboxes(server).find((input) => input.value === "es");
    const german = checkboxes(server).find((input) => input.value === "de");
    if (settings === undefined || spanish === undefined || german === undefined) {
      throw new Error("missing server controls");
    }
    settings.checked = true;
    spanish.checked = false;
    german.focus();
    const root = await mount();
    server.remove();

    expect(radios(root).find((input) => input.checked)?.value).toBe("settings");
    expect(
      checkboxes(root)
        .filter((input) => input.checked)
        .map((input) => input.value),
    ).toEqual(PLAYGROUND_LANGUAGES.filter((code) => code !== "es"));
    expect(document.activeElement).toBe(checkboxes(root).find((input) => input.value === "de"));
    await click(translateButton(root));
    expect(resultValues(root)).toEqual(
      expected(
        "settings",
        PLAYGROUND_LANGUAGES.filter((code) => code !== "es"),
      ),
    );
  });

  it("starts from the defaults when no server markup is on the page", async () => {
    const root = await mount();
    expect(radios(root).find((input) => input.checked)?.value).toBe(PLAYGROUND_DEFAULT_ITEM);
    expect(checkboxes(root).every((input) => input.checked)).toBe(true);
    expect(document.activeElement).toBe(document.body);
  });
});

describe("the animation boundary", () => {
  const source = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
  const runtimeImports = (path: string) =>
    [...source(path).matchAll(/^import (?!type )[^;]*? from "([^"]+)";/gms)].map(
      (match) => match[1],
    );

  it("reaches the animation module only through a dynamic import", () => {
    const demo = source("components/landing/playground-demo.tsx");
    expect(runtimeImports("components/landing/playground-demo.tsx")).not.toContain(
      "./playground-scramble",
    );
    expect(demo).toContain('import("./playground-scramble")');
    expect(demo).not.toMatch(/from "(gsap|@gsap\/react|@\/lib\/gsap)/);
  });

  it("registers useGSAP once in lib/gsap.ts and ScrambleText only in the scramble entry", () => {
    expect(runtimeImports("lib/gsap.ts")).toEqual(["@gsap/react", "gsap"]);
    expect(runtimeImports("lib/gsap-scramble.ts")).toEqual(["gsap/ScrambleTextPlugin", "./gsap"]);
    expect(runtimeImports("components/landing/playground-scramble.tsx")).toContain(
      "@/lib/gsap-scramble",
    );
    expect(source("lib/gsap-draw.ts")).not.toContain("ScrambleText");
    expect(source("components/landing/islands.tsx")).not.toMatch(/gsap|playground-scramble/);
  });
});
