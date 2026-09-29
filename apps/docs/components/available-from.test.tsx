// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import en from "@/messages/en.json";

type Values = Record<string, string | ((chunks: string) => string)>;

function format(key: keyof typeof en.docs.availableFrom, values: Values): string {
  return en.docs.availableFrom[key]
    .replace(/<(\w+)>(.*?)<\/\1>/g, (_, tag: string, chunks: string) => {
      const wrap = values[tag];
      return typeof wrap === "function" ? wrap(chunks) : chunks;
    })
    .replace(/\{(\w+)\}/g, (_, name: string) => String(values[name]));
}

vi.mock("next-intl/server", () => ({
  getTranslations: async () => {
    const t = (key: keyof typeof en.docs.availableFrom, values: Values) => format(key, values);
    t.markup = t;
    return t;
  },
}));

const { AvailableFrom, AVAILABLE_FROM_CLASS } = await import("./available-from");

async function renderBadge(pkg?: string): Promise<HTMLElement> {
  const node = await AvailableFrom({
    version: "0.12.0",
    locale: "en",
    ...(pkg === undefined ? {} : { pkg }),
  });
  const markup = renderToStaticMarkup(node);
  const badge = new DOMParser().parseFromString(markup, "text/html").body.firstElementChild;
  if (!(badge instanceof HTMLElement)) throw new Error("no badge rendered");
  return badge;
}

describe("AvailableFrom", () => {
  it("renders an inline badge with the version, not a callout box", async () => {
    const badge = await renderBadge();

    expect(badge.tagName).toBe("SPAN");
    expect(badge.classList.contains(AVAILABLE_FROM_CLASS)).toBe(true);
    expect(badge.classList.contains("vk-pill")).toBe(true);
    expect(badge.textContent).toBe("Available from 0.12.0");
    expect(badge.querySelector("svg, [role='none']")).toBeNull();
  });

  it("keeps the translated upgrade advice as the badge's title, without markup", async () => {
    const badge = await renderBadge();

    expect(badge.title).toContain("verbatra 0.12.0 or newer");
    expect(badge.title).toContain("verbatra --version");
    expect(badge.title).not.toContain("<code>");
  });

  it("names the package when the feature ships in its own package", async () => {
    const badge = await renderBadge("@verbatra/studio");

    expect(badge.textContent).toBe("Available from @verbatra/studio 0.12.0");
    expect(badge.title).toContain("@verbatra/studio 0.12.0 or newer");
  });
});
