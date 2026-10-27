// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { CONTRIBUTORS } from "@/lib/contributors";
import de from "@/messages/de.json";
import en from "@/messages/en.json";
import es from "@/messages/es.json";
import fr from "@/messages/fr.json";

vi.mock("next-intl/server", async () => {
  const { createTranslator } = await import("next-intl");
  const { default: messages } = await import("@/messages/en.json");
  return {
    getTranslations: async (namespace: string) =>
      createTranslator({ locale: "en", messages, namespace: namespace as never }),
  };
});

const { FooterContributors } = await import("./contributors");

const copy = en.landing.openSource;

let root: HTMLElement;

beforeAll(async () => {
  root = document.createElement("div");
  root.innerHTML = renderToStaticMarkup(await FooterContributors());
});

describe("FooterContributors", () => {
  it("says a link opens a new tab in every locale", () => {
    for (const catalog of [en, de, es, fr]) {
      expect(catalog.landing.openSource.newTab).toMatch(/^\(.+\)$/);
    }
  });

  it("keeps only the contributor copy in the open source namespace", () => {
    for (const catalog of [en, de, es, fr]) {
      expect(Object.keys(catalog.landing.openSource)).toEqual([
        "newTab",
        "contributorsHeading",
        "contributorAria",
        "contributorSlot",
        "contributorSlotHint",
      ]);
    }
  });

  it("renders one local avatar beside each committed contributor's name, linked to the profile", () => {
    expect(CONTRIBUTORS.length).toBeGreaterThan(0);
    for (const contributor of CONTRIBUTORS) {
      const link = root.querySelector(`a[href='${contributor.profileUrl}']`);
      expect(link?.textContent).toContain(`${contributor.login} on GitHub`);
      const image = link?.querySelector("img");
      expect(image?.getAttribute("alt")).toBe("");
      expect(image?.getAttribute("width")).toBe("32");
      expect(image?.getAttribute("height")).toBe("32");
    }
    expect(root.querySelectorAll("img")).toHaveLength(CONTRIBUTORS.length);
    for (const image of root.querySelectorAll("img")) {
      const src = image.getAttribute("src") ?? "";
      expect(new URL(src, "https://verbatra.test").host).toBe("verbatra.test");
    }
  });

  it("ends the contributors with an open slot that links the issue list, drawn without an image", () => {
    const slot = root.querySelector(
      ".vk-contribute-avatars > li:last-child[data-contributor-slot]",
    );
    const link = slot?.querySelector("a");
    expect(link?.getAttribute("href")).toBe("https://github.com/verbatra/verbatra/issues");
    expect(link?.getAttribute("target")).toBe("_blank");
    expect(link?.textContent).toBe(
      `${copy.contributorSlot}, ${copy.contributorSlotHint} ${copy.newTab}`,
    );
    expect(slot?.querySelector("img")).toBeNull();
    expect(slot?.querySelector(".vk-contribute-slot-mark")?.getAttribute("aria-hidden")).toBe(
      "true",
    );
  });

  it("names the contributors as a group titled like the other footer groups, not a landmark or heading", () => {
    const people = root.querySelector(".vk-contribute-people");
    expect(people?.tagName).toBe("DIV");
    expect(people?.getAttribute("role")).toBe("group");
    const title = root.querySelector(`#${people?.getAttribute("aria-labelledby")}`);
    expect(title?.tagName).toBe("P");
    expect(title?.className).toBe("vk-footer-group-title");
    expect(title?.textContent).toBe(copy.contributorsHeading);
    expect(root.querySelectorAll("section, nav, h2, h3")).toHaveLength(0);
  });

  it("renders nothing for the footer when there is nobody to show, so no empty row is drawn", async () => {
    expect(await FooterContributors([])).toBeNull();
  });
});
