// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { CONTRIBUTORS } from "@/lib/contributors";
import { MESSAGE_CATALOGS } from "@/lib/message-catalogs";
import en from "@/messages/en.json";

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

const NEW_TAB_NOTE = /^(?:\(.+\)|（.+）)$/;

describe("FooterContributors", () => {
  it("says a link opens a new tab in every locale", () => {
    for (const catalog of Object.values(MESSAGE_CATALOGS)) {
      expect(catalog.landing.openSource.newTab).toMatch(NEW_TAB_NOTE);
    }
  });

  it.each(["(opens in a new tab)", "（在新标签页中打开）"])(
    "reads %s as a new-tab note",
    (note) => {
      expect(note).toMatch(NEW_TAB_NOTE);
    },
  );

  it.each(["opens in a new tab", "(在新标签页中打开）", "（在新标签页中打开"])(
    "does not read %s as a new-tab note",
    (note) => {
      expect(note).not.toMatch(NEW_TAB_NOTE);
    },
  );

  it("keeps only the contributor copy in the open source namespace", () => {
    for (const catalog of Object.values(MESSAGE_CATALOGS)) {
      expect(Object.keys(catalog.landing.openSource)).toEqual([
        "newTab",
        "contributorsHeading",
        "contributorAria",
        "contributingGuide",
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

  it("ends the contributors with a text link to the contributing guide, not an open avatar slot", () => {
    const item = root.querySelector(
      ".vk-contribute-avatars > li:last-child[data-contributing-guide]",
    );
    const link = item?.querySelector("a");
    expect(link?.getAttribute("href")).toBe(
      "https://github.com/verbatra/verbatra/blob/main/CONTRIBUTING.md",
    );
    expect(link?.getAttribute("target")).toBe("_blank");
    expect(link?.getAttribute("rel")).toBe("noreferrer noopener");
    expect(link?.textContent).toBe(`Contributing guide ${copy.newTab}`);
    expect(copy.contributingGuide).toBe("Contributing guide");
    expect(item?.querySelector("img, .vk-contribute-slot-mark")).toBeNull();
    expect(root.querySelector("[data-contributor-slot], .vk-contribute-slot")).toBeNull();
    expect(root.querySelector("a[href='https://github.com/verbatra/verbatra/issues']")).toBeNull();
    expect(root.textContent).not.toContain("avatar here");
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
