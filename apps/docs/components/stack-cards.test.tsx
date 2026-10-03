// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { type StackCard, StackCards } from "./stack-cards";

const CARDS: ReadonlyArray<StackCard> = [
  { label: "React", icon: "react", formats: ["i18next-json"], href: "/docs/pick-your-stack#react" },
  {
    label: "iOS and macOS",
    icon: "apple",
    formats: ["apple-strings", "apple-xcstrings"],
    href: "#ios-and-macos",
  },
  { label: "Something else", icon: "custom", formats: [], href: "#something-else" },
];

function renderCards(locale: "en" | "de"): Document {
  const markup = renderToStaticMarkup(
    <StackCards title="Pick your stack" cards={CARDS} locale={locale} />,
  );
  return new DOMParser().parseFromString(markup, "text/html");
}

describe("StackCards", () => {
  it("is a navigation landmark named after its title, one list item per card", () => {
    const nav = renderCards("en").querySelector("nav");
    expect(nav?.getAttribute("aria-label")).toBe("Pick your stack");
    expect(nav?.querySelectorAll("li a")).toHaveLength(CARDS.length);
  });

  it("names each card by its stack and format ids, keeping the logo out of the name", () => {
    const links = [...renderCards("en").querySelectorAll("a")];
    expect(links.map((link) => link.textContent)).toEqual([
      "Reacti18next-json",
      "iOS and macOSapple-stringsapple-xcstrings",
      "Something else",
    ]);
    for (const link of links) {
      const logo = link.querySelector("svg");
      expect(logo?.closest('[aria-hidden="true"]')).not.toBeNull();
    }
  });

  it("draws each logo once in a sprite and references it from the card", () => {
    const doc = renderCards("en");
    const symbols = [...doc.querySelectorAll("symbol")].map((symbol) => symbol.id);
    expect(symbols).toEqual(["vk-stack-icon-react", "vk-stack-icon-apple", "vk-stack-icon-custom"]);
    const uses = [...doc.querySelectorAll("a use")].map((use) => use.getAttribute("href"));
    expect(uses).toEqual(symbols.map((id) => `#${id}`));
  });

  it("prefixes the reader's locale on a page link and leaves an in-page anchor alone", () => {
    const hrefs = [...renderCards("de").querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(["/de/docs/pick-your-stack#react", "#ios-and-macos", "#something-else"]);
  });

  it("uses single-colour logos that follow the text colour, never a brand colour", () => {
    const paths = [...renderCards("en").querySelectorAll("symbol path, symbol svg")];
    for (const element of paths) {
      const fill = element.getAttribute("fill");
      expect(fill === null || fill === "none" || fill === "currentColor", fill ?? "").toBe(true);
    }
    expect(renderCards("en").body.innerHTML).not.toMatch(/dark:/);
  });
});
