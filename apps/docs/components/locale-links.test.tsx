// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { LOCALE_DISPLAY_NAMES } from "@/lib/language-select-copy";

const route = vi.hoisted(() => ({ pathname: "/de/compare" }));

vi.mock("next/navigation", () => ({ usePathname: () => route.pathname }));

const { LocaleLinks } = await import("./locale-links");

function render(pathname: string, current: "en" | "de" | "es" | "fr"): Document {
  route.pathname = pathname;
  const markup = renderToStaticMarkup(<LocaleLinks label="Sprache" current={current} />);
  return new DOMParser().parseFromString(markup, "text/html");
}

describe("LocaleLinks", () => {
  it("links the current page in every locale with its language and endonym", () => {
    const links = [...render("/de/compare", "de").querySelectorAll("a")];
    expect(
      links.map((link) => [
        link.getAttribute("href"),
        link.getAttribute("hreflang"),
        link.getAttribute("lang"),
        link.textContent,
      ]),
    ).toEqual([
      ["/compare", "en", "en", LOCALE_DISPLAY_NAMES.en],
      ["/de/compare", "de", "de", LOCALE_DISPLAY_NAMES.de],
      ["/es/compare", "es", "es", LOCALE_DISPLAY_NAMES.es],
      ["/fr/compare", "fr", "fr", LOCALE_DISPLAY_NAMES.fr],
    ]);
  });

  it("marks only the reader's locale as the current page", () => {
    const links = [...render("/fr", "fr").querySelectorAll("a")];
    expect(links.map((link) => link.getAttribute("aria-current"))).toEqual([
      null,
      null,
      null,
      "page",
    ]);
    expect(links.map((link) => link.getAttribute("href"))).toEqual(["/", "/de", "/es", "/fr"]);
  });

  it("is a navigation landmark named by its visible, localized label", () => {
    const doc = render("/", "en");
    const nav = doc.querySelector("nav");
    const label = doc.getElementById(nav?.getAttribute("aria-labelledby") ?? "");
    expect(label?.textContent).toBe("Sprache");
  });
});

describe("LocaleLinks on the comparison page", () => {
  function activate(search: string, locale: string): string {
    route.pathname = "/de/compare";
    window.history.replaceState(null, "", `/de/compare${search}`);
    document.body.innerHTML = '<div id="host"></div>';
    const root = createRoot(document.getElementById("host") as HTMLElement);
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    act(() => root.render(<LocaleLinks label="Sprache" current="de" />));
    const link = document.querySelector<HTMLAnchorElement>(`a[hreflang="${locale}"]`);
    document.addEventListener("click", (event) => event.preventDefault(), { once: true });
    act(() => link?.click());
    const target = new URL(link?.href ?? "", window.location.origin);
    act(() => root.unmount());
    return `${target.pathname}${target.search}`;
  }

  it("keeps the chosen tool when the reader switches language", () => {
    expect(activate("?tool=weblate&x=1", "es")).toBe("/es/compare?tool=weblate");
  });

  it("adds nothing when no tool is chosen", () => {
    expect(activate("?x=1", "fr")).toBe("/fr/compare");
  });
});
