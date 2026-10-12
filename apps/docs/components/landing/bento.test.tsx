// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { GATE_RUN_LINES } from "@/lib/gate-demo";
import { BENTO_TILES } from "@/lib/landing-bento";
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

  it("lists every provider id and the human-only none", () => {
    const ids = [...tile("providers").querySelectorAll("[data-artifact] li")].map(
      (li) => li.textContent,
    );
    expect(ids).toEqual([...MACHINE_PROVIDER_IDS, "none"]);
  });

  it("lists every supported format by its display label", () => {
    const labels = [...tile("formats").querySelectorAll("[data-artifact] li")].map(
      (li) => li.textContent,
    );
    expect(labels).toEqual(SUPPORTED_FORMAT_IDS.map((id) => FORMAT_DISPLAY[id].label));
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
