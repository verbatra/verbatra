// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { LOCALE_DISPLAY_NAMES } from "@/lib/language-select-copy";
import type { Locale } from "@/lib/locales";

const route = vi.hoisted(() => ({ pathname: "/de/privacy" }));

vi.mock("next/navigation", () => ({ usePathname: () => route.pathname }));

const { LocaleLinks } = await import("./locale-links");

function render(pathname: string, current: Locale): Document {
  route.pathname = pathname;
  const markup = renderToStaticMarkup(<LocaleLinks label="Sprache" current={current} />);
  return new DOMParser().parseFromString(markup, "text/html");
}

describe("LocaleLinks", () => {
  it("links the current page in every locale with its language and endonym", () => {
    const links = [...render("/de/privacy", "de").querySelectorAll("a")];
    expect(
      links.map((link) => [
        link.getAttribute("href"),
        link.getAttribute("hreflang"),
        link.getAttribute("lang"),
        link.textContent,
      ]),
    ).toEqual([
      ["/privacy", "en", "en", LOCALE_DISPLAY_NAMES.en],
      ["/de/privacy", "de", "de", LOCALE_DISPLAY_NAMES.de],
      ["/es/privacy", "es", "es", LOCALE_DISPLAY_NAMES.es],
      ["/fr/privacy", "fr", "fr", LOCALE_DISPLAY_NAMES.fr],
      ["/zh-CN/privacy", "zh-CN", "zh-CN", LOCALE_DISPLAY_NAMES["zh-CN"]],
      ["/pt-BR/privacy", "pt-BR", "pt-BR", LOCALE_DISPLAY_NAMES["pt-BR"]],
      ["/ja/privacy", "ja", "ja", LOCALE_DISPLAY_NAMES.ja],
    ]);
  });

  it("marks only the reader's locale as the current page", () => {
    const links = [...render("/fr", "fr").querySelectorAll("a")];
    expect(links.map((link) => link.getAttribute("aria-current"))).toEqual([
      null,
      null,
      null,
      "page",
      null,
      null,
      null,
    ]);
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/",
      "/de",
      "/es",
      "/fr",
      "/zh-CN",
      "/pt-BR",
      "/ja",
    ]);
  });

  it("is a navigation landmark named by its visible, localized label", () => {
    const doc = render("/", "en");
    const nav = doc.querySelector("nav");
    const label = doc.getElementById(nav?.getAttribute("aria-labelledby") ?? "");
    expect(label?.textContent).toBe("Sprache");
  });
});
