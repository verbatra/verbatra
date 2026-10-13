// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { GATE_RUN_LINES } from "@/lib/gate-demo";
import { BENTO_FORMAT_LINES, BENTO_PROVIDER_DIFF, BENTO_TILES } from "@/lib/landing-bento";
import { FORMAT_DISPLAY, MACHINE_PROVIDER_IDS, SUPPORTED_FORMAT_IDS } from "@/lib/landing-facts";
import en from "@/messages/en.json";

vi.mock("next-intl/server", async () => {
  const { createTranslator } = await import("next-intl");
  const { default: messages } = await import("@/messages/en.json");
  return {
    getTranslations: async (namespace: string) =>
      createTranslator({ locale: "en", messages, namespace: namespace as never }),
    getLocale: async () => "de",
  };
});

const { Bento } = await import("./bento");

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

describe("Bento", () => {
  it("lets the keyboard reach and scroll every sideways-scrolling block, each a named group, never a landmark, and end-faded", () => {
    const blocks = [...root.querySelectorAll<HTMLElement>(".vk-scroll-fade")];
    expect(blocks.length).toBeGreaterThan(0);
    expect(root.querySelectorAll("section").length).toBeLessThanOrEqual(1);
    for (const block of blocks) {
      expect(block.tagName).toBe("DIV");
      expect(block.getAttribute("role")).toBe("group");
      expect(block.getAttribute("tabindex")).toBe("0");
      const name = root.querySelector(`#${block.getAttribute("aria-labelledby")}`)?.textContent;
      expect(name?.trim()).not.toBe("");
    }
    expect(root.querySelector(".overflow-x-auto")).toBeNull();
  });

  it("renders every tile with its en.json title and body", () => {
    expect(root.querySelector("h2#features-heading")?.textContent).toBe(en.landing.bento.heading);
    for (const { key } of BENTO_TILES) {
      const copy = en.landing.bento.items[key];
      expect(tile(key).querySelector("h3")?.textContent).toBe(copy.title);
      expect(tile(key).querySelector("p")?.textContent).toBe(copy.body.replaceAll("`", ""));
    }
  });

  it("varies tile widths instead of one repeated card", () => {
    const spans = new Set(
      BENTO_TILES.map((t) => tile(t.key).className.match(/lg:col-span-(\d+)/)?.[1]),
    );
    expect(spans.size).toBeGreaterThanOrEqual(3);
    expect(root.querySelector("svg")).toBeNull();
  });

  it("shows a provider switch as a config diff instead of repeating the provider list", () => {
    const diff = tile("providers").querySelector('[data-artifact="providers"]');
    expect(diff?.querySelector("figcaption")?.textContent).toBe("verbatra.config.ts");
    const rows = [...(diff?.querySelectorAll<HTMLElement>("[data-diff]") ?? [])];
    expect(rows.map((row) => row.dataset.diff)).toEqual(
      BENTO_PROVIDER_DIFF.map((line) =>
        line.sign === " " ? "context" : line.sign === "-" ? "removed" : "added",
      ),
    );
    expect(rows.map((row) => row.textContent)).toEqual(
      BENTO_PROVIDER_DIFF.map((line) => `${line.sign}${line.text}`),
    );
    for (const id of MACHINE_PROVIDER_IDS.filter((id) => id !== "gemini" && id !== "deepl")) {
      expect(diff?.textContent).not.toContain(`"${id}"`);
    }
  });

  it("writes one key into several framework files instead of listing every format", () => {
    const list = tile("formats").querySelector('[data-artifact="formats"]');
    const rows = [...(list?.querySelectorAll<HTMLElement>("li[data-format]") ?? [])];
    expect(rows.map((row) => row.dataset.format)).toEqual(BENTO_FORMAT_LINES.map((l) => l.format));
    expect(rows.length).toBeLessThan(SUPPORTED_FORMAT_IDS.length);
    BENTO_FORMAT_LINES.forEach((entry, index) => {
      const row = rows[index];
      expect(row?.textContent).toContain(FORMAT_DISPLAY[entry.format].label);
      expect(row?.textContent).toContain(entry.file);
      expect(row?.querySelector(".truncate")?.getAttribute("title")).toBe(entry.file);
      expect(row?.querySelector("code")?.textContent).toBe(entry.line);
      expect(row?.querySelector(".vk-placeholder")?.textContent).toBe(entry.placeholder);
    });
  });

  it("stretches every artifact to the tile height and captions each panel, so a row ends level", () => {
    for (const { key } of BENTO_TILES) {
      const holder =
        tile(key).querySelector("[data-tile] > div:nth-child(2)") ?? tile(key).children[1];
      expect(holder?.className).toContain("flex-1");
      expect(holder?.className).toContain("[&>*]:flex-1");
      expect(tile(key).querySelector("figcaption, li[data-format]")).not.toBeNull();
    }
  });

  it("prints the real integrity gate run with the dropped placeholder as a chip", () => {
    const run = tile("integrity").querySelector('[data-artifact="integrity"]');
    expect(run?.getAttribute("lang")).toBe("en");
    expect(run?.textContent).toBe(`$ ${GATE_RUN_LINES.join("")}`);
    expect(run?.querySelector(".vk-placeholder")?.textContent).toBe("{count}");
  });

  it("highlights the lock file, key and adapter samples with both themes", () => {
    for (const key of ["incremental", "keys", "adapters"]) {
      const pre = tile(key).querySelector("pre.shiki");
      expect(pre?.className).toContain("github-light github-dark");
      expect(pre?.innerHTML).toContain("--shiki-light:");
    }
    expect(tile("incremental").querySelector("figcaption")?.textContent).toBe("verbatra.lock.json");
  });

  it("shows the action triggers and links evidence to localized docs pages", () => {
    expect(tile("action").querySelector("dl")?.textContent).toContain("on: pull_request");
    const hrefs = [...root.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("/de/docs/cli/check#qualitätsprüfung");
    expect(hrefs).toContain("/de/docs/github-action");
    expect(hrefs.every((href) => href?.startsWith("/de/docs/"))).toBe(true);
  });
});
