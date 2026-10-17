// @vitest-environment jsdom

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { GITHUB_URL } from "@/components/landing/links";
import { CONTRIBUTORS } from "@/lib/contributors";
import { CONTRIBUTION_STEPS, OPEN_SOURCE_LINKS } from "@/lib/landing-open-source";
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

const { Contributors, OpenSource } = await import("./open-source");

const copy = en.landing.openSource;

const contributingGuide = readFileSync(join(process.cwd(), "../../CONTRIBUTING.md"), "utf8");

let root: HTMLElement;

beforeAll(async () => {
  root = document.createElement("div");
  root.innerHTML = renderToStaticMarkup(await OpenSource());
});

describe("OpenSource", () => {
  it("keeps the open-source anchor on a banded section named by its heading", () => {
    const section = root.querySelector("section#open-source");
    expect(section?.className).toBe("vk-band");
    expect(section?.getAttribute("aria-labelledby")).toBe("open-source-heading");
    expect(root.querySelector("h2#open-source-heading")?.textContent).toBe(copy.heading);
    expect(root.textContent).toContain(copy.lead);
  });

  it("numbers the contribution steps in an ordered list, each with a title and its command", () => {
    const steps = Array.from(root.querySelectorAll("ol.vk-contribute-steps > li"));
    expect(steps.map((step) => step.getAttribute("data-step"))).toEqual(
      CONTRIBUTION_STEPS.map((step) => step.id),
    );
    steps.forEach((step, index) => {
      const entry = CONTRIBUTION_STEPS[index];
      if (!entry) throw new Error("step missing");
      const text = copy.steps[entry.id];
      expect(step.querySelector(".vk-contribute-mark")?.getAttribute("aria-hidden")).toBe("true");
      expect(step.querySelector(".vk-contribute-mark")?.textContent).toBe(String(index + 1));
      expect(step.querySelector("h3")?.textContent).toBe(text.title);
      expect(step.querySelector("p")).toBeNull();
      expect(step.querySelector("code")?.textContent).toBe(entry.command);
    });
  });

  it("takes every step's command and wording from the contributor guide", () => {
    for (const { command } of CONTRIBUTION_STEPS) {
      const fenced = contributingGuide.includes(`\n${command}\n`);
      const inline = contributingGuide.includes(`\`${command}\``);
      expect(fenced || inline, command).toBe(true);
    }
    expect(contributingGuide).toMatch(
      /Clone the repository and install dependencies from the root:\n\n```\npnpm install\n```/,
    );
    expect(copy.steps.setup.title).toMatch(/^Clone and install from the root$/);
    expect(contributingGuide).toMatch(/1\. Branch from `main`\./);
    expect(contributingGuide).toMatch(/Run `pnpm verify` locally/);
    expect(copy.steps.change.title).toMatch(/^Branch from main and run the checks$/);
    expect(contributingGuide).toMatch(/Add a changeset if a publishable package changed/);
    expect(contributingGuide).toMatch(/Open a pull request with the template/);
    expect(copy.steps.pullRequest.title).toMatch(/changeset if needed and open a pull request$/);
  });

  it("links the repository, contributor guide, agents guide, code of conduct and license in a new tab", () => {
    const nav = root.querySelector("nav[aria-labelledby='open-source-links']");
    const hrefs = Array.from(nav?.querySelectorAll("a") ?? []).map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual([
      GITHUB_URL,
      "https://github.com/verbatra/verbatra/blob/main/CONTRIBUTING.md",
      "https://github.com/verbatra/verbatra/blob/main/AGENTS.md",
      "https://github.com/verbatra/verbatra/blob/main/CODE_OF_CONDUCT.md",
      "https://github.com/verbatra/verbatra/blob/main/LICENSE",
    ]);
    for (const link of OPEN_SOURCE_LINKS) {
      const anchor = nav?.querySelector(`a[href='${link.href}']`);
      expect(anchor?.textContent).toBe(`${copy[link.key]} ${copy.newTab}`);
      expect(anchor?.getAttribute("target")).toBe("_blank");
      expect(anchor?.getAttribute("rel")).toBe("noreferrer noopener");
    }
  });

  it("draws no arrow or external-link icon on any link", () => {
    expect(root.querySelectorAll("a svg")).toHaveLength(0);
    expect(root.textContent).not.toMatch(/[←-⇿]/);
  });

  it("links the root AGENTS.md that exists in the repository, and no good first issue label", () => {
    const hrefs = Array.from(root.querySelectorAll("a")).map((a) => a.getAttribute("href") ?? "");
    const agents = hrefs.filter((href) => href.endsWith("/AGENTS.md"));
    expect(agents).toEqual(["https://github.com/verbatra/verbatra/blob/main/AGENTS.md"]);
    expect(existsSync(join(process.cwd(), "../../AGENTS.md"))).toBe(true);
    expect(hrefs.some((href) => /good%20first%20issue|good\+first/i.test(href))).toBe(false);
  });

  it("says a link opens a new tab in every locale", () => {
    for (const catalog of [en, de, es, fr]) {
      expect(catalog.landing.openSource.newTab).toMatch(/^\(.+\)$/);
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

  it("keeps the visible copy of the section to sixty words", () => {
    const section = root.querySelector("section#open-source")?.cloneNode(true);
    if (!(section instanceof Element)) throw new Error("no contribution section");
    for (const hidden of section.querySelectorAll(".sr-only, [aria-hidden='true'], code"))
      hidden.remove();
    const words = (section.textContent ?? "")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .split(/\s+/)
      .filter((word) => /[\p{L}\p{N}]/u.test(word));
    expect(words.length).toBeLessThanOrEqual(60);
  });

  it("names the contributors as a group, not a nested landmark", () => {
    const people = root.querySelector(".vk-contribute-people");
    expect(people?.tagName).toBe("DIV");
    expect(people?.getAttribute("role")).toBe("group");
    expect(root.querySelector(`#${people?.getAttribute("aria-labelledby")}`)?.textContent).toBe(
      copy.contributorsHeading,
    );
    expect(root.querySelectorAll("section section")).toHaveLength(0);
  });

  it.each([
    ["en", en],
    ["de", de],
    ["es", es],
    ["fr", fr],
  ])("gives every step a title and no body in %s", (_locale, catalog) => {
    for (const [id, step] of Object.entries(catalog.landing.openSource.steps)) {
      expect(Object.keys(step), id).toEqual(["title"]);
    }
  });

  it("drops the contributors block when there is nobody to show", () => {
    expect(
      renderToStaticMarkup(
        <Contributors contributors={[]} title="t" ariaFor={(login) => login} newTab="n" />,
      ),
    ).toBe("");
  });
});

describe("license label", () => {
  it.each([
    ["en", en],
    ["de", de],
    ["es", es],
    ["fr", fr],
  ] as const)("names the license the same way here and in the footer (%s)", (_locale, messages) => {
    expect(messages.landing.footer.cols.legal.license).toBe(messages.landing.openSource.license);
  });

  it("writes the English license label in sentence case", () => {
    expect(en.landing.openSource.license).toBe("MIT license");
    expect(en.landing.footer.legalLicense).toContain("MIT license");
  });
});
