// @vitest-environment jsdom

import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  BENTO_FORMAT_EXAMPLE,
  BENTO_KEY_ENV_VARS,
  BENTO_PROVIDER_LINE,
  BENTO_RUN_SUMMARY_FIELDS,
  BENTO_TILES,
  FORMAT_FAMILIES,
  formatsInFamily,
} from "@/lib/landing-bento";
import { FORMAT_DISPLAY, MACHINE_PROVIDER_IDS, SUPPORTED_FORMAT_IDS } from "@/lib/landing-facts";
import { PROVIDER_KINDS, providerShortLabel, providersOfKind } from "@/lib/landing-providers";
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

function spans(key: string): string {
  return [...tile(key).className.matchAll(/(lg|xl):\[--grid-span:(\d+)\]/g)]
    .map(([, width, span]) => `${width}${span}`)
    .join(" ");
}

describe("Bento", () => {
  it("sets its head inline in the first grid cell, then the tiles in reading order", () => {
    const grid = root.querySelector(".vk-bento.vk-grid-12");
    const head = grid?.firstElementChild;
    expect(head?.className).toBe("vk-bento-head");
    expect(head?.querySelector(".vk-section-head")?.getAttribute("data-layout")).toBe("inline");
    expect(head?.querySelector("h2#features-heading")?.textContent).toBe(copy.heading);
    expect(head?.querySelector(".vk-section-head-lead")?.textContent).toBe(copy.lead);
    const tiles = [...root.querySelectorAll<HTMLElement>("[data-tile]")];
    expect(tiles.map((node) => node.dataset.tile)).toEqual(BENTO_TILES.map((t) => t.key));
    expect(tiles.every((node) => node.parentElement === grid)).toBe(true);
    expect(tiles.every((node) => node.querySelector("[data-reveal]") === null)).toBe(true);
    expect(
      tiles.filter((node) => node.hasAttribute("data-reveal")).map((n) => n.dataset.tile),
    ).toEqual(["keys"]);
    expect(head?.hasAttribute("data-reveal")).toBe(false);
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
    expect(BENTO_TILES.map((t) => spans(t.key))).toEqual([
      "lg8",
      "lg6 xl7",
      "lg6 xl5",
      "lg12",
      "lg12",
    ]);
    const last = tile("frameworks");
    expect(last.className).not.toContain("rounded-xl");
    expect(last.className).toContain("border-t");
    expect(tile("providers").className).toContain("rounded-xl");
    expect(tile("sdk").className).toContain("rounded-xl");
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

  it("groups the provider ids by kind, ends with the human-only none, and labels the id slot", () => {
    const panel = tile("providers").querySelector('[data-artifact="providers"]');
    const badged: string[] = [];
    for (const kind of PROVIDER_KINDS) {
      const group = panel?.querySelector(`[data-kind="${kind}"]`);
      expect(group?.querySelector("dt")?.textContent).toBe(copy.items.providers.kinds[kind]);
      const ids = [...(group?.querySelectorAll<HTMLElement>("li[data-provider]") ?? [])];
      expect(ids.map((item) => item.querySelector("code")?.textContent)).toEqual([
        ...providersOfKind(kind),
      ]);
      for (const item of ids)
        if (item.querySelector(".vk-available-from")) badged.push(item.dataset.provider ?? "");
    }
    expect(badged.sort()).toEqual([...RELEASE_BADGE.providers].sort());
    expect(
      [...(panel?.querySelectorAll("[data-kind]") ?? [])].map((node) =>
        node.getAttribute("data-kind"),
      ),
    ).toEqual([...PROVIDER_KINDS, "none"]);
    const none = panel?.querySelector('[data-kind="none"]');
    expect(none?.querySelector("dt")?.textContent).toBe(copy.items.providers.kinds.none);
    expect(none?.querySelector("a")?.textContent).toBe("none");
    expect(none?.querySelector("a")?.getAttribute("href")).toBe("/de/docs/human-only-workflow");
    expect(none?.querySelector(".vk-available-from")?.textContent).toBe(
      en.docs.availableFrom.title.replace("{version}", RELEASE_BADGE.version),
    );
    const caption = tile("providers").querySelector("figcaption");
    expect(caption?.querySelector("[data-id-slot]")?.textContent).toBe(
      copy.items.providers.idSlot.replaceAll("`", ""),
    );
    expect(caption?.textContent).toContain("verbatra.config.ts");
    expect(
      [...(caption?.querySelectorAll(":scope > code") ?? [])].map((node) => node.textContent),
    ).toEqual([BENTO_PROVIDER_LINE]);
    const link = [...tile("providers").querySelectorAll("a")].at(-1);
    expect(link?.textContent).toBe(copy.items.providers.link);
    expect(link?.getAttribute("href")).toBe("/de/docs/providers");
  });

  it("pairs each provider with its key variable, badging only the release's new ones", () => {
    const figure = tile("keys").querySelector('figure[data-artifact="keys"]');
    expect(figure?.querySelector("figcaption")?.textContent).toBe(copy.items.keys.variables);
    const terms = [...(figure?.querySelectorAll("dl > dt") ?? [])].map((dt) => dt.textContent);
    expect(terms).toEqual(MACHINE_PROVIDER_IDS.map(providerShortLabel));
    const items = [...tile("keys").querySelectorAll<HTMLElement>("dd[data-provider]")];
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
      expect(item.querySelector("[data-configurable]")?.textContent ?? null).toBe(
        BENTO_KEY_ENV_VARS[id].configurable
          ? copy.items.keys.configurable.replaceAll("`", "")
          : null,
      );
    }
  });

  it("marks the claims with a fill bar, never violet text", () => {
    for (const claim of tile("keys").querySelectorAll("[data-claim]")) {
      expect(claim.className).toContain("border-(--accent-fill)");
      expect(claim.className).not.toContain("text-(--accent)");
    }
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

  it("groups every supported format by family, with one real key line and the custom adapter guide", () => {
    const panel = tile("formats").querySelector('[data-artifact="formats"]');
    const families = [...(panel?.querySelectorAll<HTMLElement>("[data-family]") ?? [])];
    expect(families.map((node) => node.dataset.family)).toEqual([...FORMAT_FAMILIES]);
    for (const node of families) {
      const family = node.dataset.family as (typeof FORMAT_FAMILIES)[number];
      expect(node.querySelector("h4")?.textContent).toBe(copy.items.formats.families[family]);
      expect(
        [...node.querySelectorAll<HTMLElement>("li[data-format]")].map((li) => li.textContent),
      ).toEqual(formatsInFamily(family).map((format) => FORMAT_DISPLAY[format].label));
    }
    expect(panel?.querySelectorAll("li[data-format]").length).toBe(SUPPORTED_FORMAT_IDS.length);
    const example = panel?.querySelector(`[data-example="${BENTO_FORMAT_EXAMPLE.format}"]`);
    expect(example?.textContent).toContain(BENTO_FORMAT_EXAMPLE.file);
    expect(example?.querySelector("code")?.textContent).toBe(BENTO_FORMAT_EXAMPLE.line);
    expect(example?.querySelector(".vk-placeholder")?.textContent).toBe(
      BENTO_FORMAT_EXAMPLE.placeholder,
    );
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
