// @vitest-environment jsdom

import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  BENTO_FORMAT_LINES,
  BENTO_KEY_ENV_VARS,
  BENTO_PROVIDER_DIFF,
  BENTO_RUN_SUMMARY_FIELDS,
  BENTO_TILES,
} from "@/lib/landing-bento";
import { FORMAT_DISPLAY, MACHINE_PROVIDER_IDS, SUPPORTED_FORMAT_IDS } from "@/lib/landing-facts";
import { RELEASE_BADGE } from "@/lib/release-badge";
import { STACK_IDS, STACKS } from "@/lib/stacks";
import en from "@/messages/en.json";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    prefetch: _prefetch,
    ...rest
  }: ComponentProps<"a"> & { href: string; prefetch?: unknown }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("next-intl/server", async () => {
  const { createTranslator } = await import("next-intl");
  const { default: messages } = await import("@/messages/en.json");
  return {
    getTranslations: async (scope: string | { namespace: string }) =>
      createTranslator({
        locale: "en",
        messages,
        namespace: (typeof scope === "string" ? scope : scope.namespace) as never,
      }),
    getLocale: async () => "de",
  };
});

const { Bento } = await import("./bento");

const copy = en.landing.bento;

let root: HTMLElement;

beforeAll(async () => {
  root = document.createElement("div");
  root.innerHTML = renderToStaticMarkup(await Bento());
});

function tile(key: string): HTMLElement {
  const node = root.querySelector<HTMLElement>(`[data-tile="${key}"]`);
  if (!node) throw new Error(`no ${key} tile`);
  return node;
}

function span(key: string): string | undefined {
  return tile(key).className.match(/lg:col-span-(\d+)/)?.[1];
}

describe("Bento", () => {
  it("opens with a heading and a lead, then lists the tiles in reading order", () => {
    expect(root.querySelector("h2#features-heading")?.textContent).toBe(copy.heading);
    expect(root.querySelector(".vk-section-head-lead")?.textContent).toBe(copy.lead);
    const tiles = [...root.querySelectorAll<HTMLElement>("[data-tile]")];
    expect(tiles.map((node) => node.dataset.tile)).toEqual(BENTO_TILES.map((t) => t.key));
    expect(root.innerHTML).not.toContain("dense");
  });

  it("titles every tile with a .vk-h4 h3 from en.json", () => {
    for (const { key } of BENTO_TILES) {
      const title = tile(key).querySelector("h3");
      expect(title?.textContent).toBe(copy.items[key].title);
      expect(title?.className).toContain("vk-h4");
    }
  });

  it("varies tile sizes and never ends in a row of equal small cards", () => {
    expect(BENTO_TILES.map((t) => span(t.key))).toEqual(["8", "4", "6", "6", "12"]);
    const last = tile("frameworks");
    expect(last.className).not.toContain("rounded-xl");
    expect(last.className).toContain("border-t");
    expect(tile("providers").className).toContain("rounded-xl");
  });

  it("lets the keyboard reach and scroll every sideways-scrolling block, each a named group", () => {
    const blocks = [...root.querySelectorAll<HTMLElement>(".vk-scroll-fade")];
    expect(blocks.length).toBeGreaterThan(0);
    for (const block of blocks) {
      expect(block.getAttribute("role")).toBe("group");
      expect(block.getAttribute("tabindex")).toBe("0");
      const name = root.querySelector(`#${block.getAttribute("aria-labelledby")}`)?.textContent;
      expect(name?.trim()).not.toBe("");
    }
    expect(root.querySelectorAll("section").length).toBeLessThanOrEqual(1);
  });

  it("shows a provider switch as a config diff and dates the none provider with the release badge", () => {
    const diff = tile("providers").querySelector('[data-artifact="providers"]');
    expect(diff?.querySelector("figcaption")?.textContent).toBe("verbatra.config.ts");
    const rows = [...(diff?.querySelectorAll<HTMLElement>("[data-diff]") ?? [])];
    expect(rows.map((row) => row.textContent)).toEqual(
      BENTO_PROVIDER_DIFF.map((line) => `${line.sign}${line.text}`),
    );
    const none = tile("providers").querySelector("[data-none-provider]");
    expect(none?.textContent).toContain(copy.items.providers.none);
    expect(none?.querySelector("a")?.getAttribute("href")).toBe("/de/docs/human-only-workflow");
    expect(none?.querySelector(".vk-available-from")?.textContent).toBe(
      en.docs.availableFrom.title.replace("{version}", RELEASE_BADGE.version),
    );
  });

  it("lists one key variable per provider, badging only the release's new ones", () => {
    const items = [...tile("keys").querySelectorAll<HTMLElement>("li[data-provider]")];
    expect(items.map((item) => item.dataset.provider)).toEqual([...MACHINE_PROVIDER_IDS]);
    for (const item of items) {
      const id = item.dataset.provider as (typeof MACHINE_PROVIDER_IDS)[number];
      expect(item.querySelector("code")?.textContent).toBe(BENTO_KEY_ENV_VARS[id].name);
      expect(item.querySelector(".vk-available-from") !== null).toBe(
        RELEASE_BADGE.providers.includes(id),
      );
      expect(item.textContent?.includes(copy.items.keys.optional)).toBe(
        BENTO_KEY_ENV_VARS[id].optional,
      );
    }
    const list = tile("keys").querySelector("ul[aria-labelledby]");
    expect(root.querySelector(`#${list?.getAttribute("aria-labelledby")}`)?.textContent).toBe(
      copy.items.keys.variables,
    );
  });

  it("links the key and safety claims to the docs that state them", () => {
    const keys = tile("keys");
    expect([...keys.querySelectorAll("[data-claim]")].map((c) => c.textContent)).toEqual(
      Object.values(copy.items.keys.claims),
    );
    const hrefs = [...keys.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual([
      "/de/docs/providers#keys-kommen-aus-der-umgebung",
      "/de/docs/translation-safety",
    ]);
  });

  it("writes one key into several framework files and links the custom adapter guide", () => {
    const list = tile("formats").querySelector('[data-artifact="formats"]');
    const rows = [...(list?.querySelectorAll<HTMLElement>("li[data-format]") ?? [])];
    expect(rows.map((row) => row.dataset.format)).toEqual(BENTO_FORMAT_LINES.map((l) => l.format));
    expect(rows.length).toBeLessThan(SUPPORTED_FORMAT_IDS.length);
    BENTO_FORMAT_LINES.forEach((entry, index) => {
      const row = rows[index];
      expect(row?.textContent).toContain(FORMAT_DISPLAY[entry.format].label);
      expect(row?.querySelector("code")?.textContent).toBe(entry.line);
      expect(row?.querySelector(".vk-placeholder")?.textContent).toBe(entry.placeholder);
    });
    const hrefs = [...tile("formats").querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("/de/docs/custom-format-adapters");
  });

  it("highlights the RunSummary excerpt in both themes and links its reference page", () => {
    const pre = tile("sdk").querySelector("pre.shiki");
    expect(pre?.className).toContain("github-light github-dark");
    for (const field of BENTO_RUN_SUMMARY_FIELDS) {
      expect(pre?.textContent?.replace(/\s+/g, " ")).toContain(field.replace(/\s+/g, " "));
    }
    expect(tile("sdk").querySelector("a")?.getAttribute("href")).toBe("/de/docs/sdk/run-summary");
  });

  it("names every quickstart stack in the strip and links each to its quickstart", () => {
    const links = [...tile("frameworks").querySelectorAll<HTMLAnchorElement>("li[data-stack] a")];
    expect(links.map((a) => a.textContent)).toEqual(STACK_IDS.map((id) => STACKS[id].name));
    expect(links.map((a) => a.getAttribute("href"))).toEqual(
      STACK_IDS.map((id) => `/de/docs/quickstart/${id}`),
    );
    const all = [...tile("frameworks").querySelectorAll("a")].at(-1);
    expect(all?.textContent).toBe(copy.items.frameworks.all);
    expect(all?.getAttribute("href")).toBe("/de/docs/quickstart");
  });

  it("links only to localized docs pages", () => {
    const hrefs = [...root.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(hrefs.every((href) => href?.startsWith("/de/docs/"))).toBe(true);
  });
});
