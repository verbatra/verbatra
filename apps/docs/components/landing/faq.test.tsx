// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { i18n, type Locale } from "@/lib/i18n";
import {
  FAQ_ANSWER_LINKS,
  FAQ_ASIDE_LINKS,
  FAQ_ITEM_IDS,
  faqHref,
  publishedProviders,
} from "@/lib/landing-faq";
import { providerShortLabel } from "@/lib/landing-providers";
import { PACKAGE_VERSION } from "@/lib/site";
import { faqPageLd } from "@/lib/structured-data";
import de from "@/messages/de.json";
import en from "@/messages/en.json";
import es from "@/messages/es.json";
import fr from "@/messages/fr.json";
import { LICENSE_URL } from "./links";

const CATALOGS = { en, de, es, fr } as const;

vi.mock("next-intl/server", async () => {
  const { createTranslator } = await import("next-intl");
  const catalogs = {
    en: (await import("@/messages/en.json")).default,
    de: (await import("@/messages/de.json")).default,
    es: (await import("@/messages/es.json")).default,
    fr: (await import("@/messages/fr.json")).default,
  };
  return {
    getTranslations: async ({ locale, namespace }: { locale: Locale; namespace: string }) =>
      createTranslator({ locale, messages: catalogs[locale], namespace: namespace as never }),
  };
});

const { Faq, faqContent } = await import("./faq");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mounted: { container: HTMLDivElement; root: Root } | undefined;

async function render(locale: Locale): Promise<HTMLDivElement> {
  const element = await Faq({ locale });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(element);
  });
  mounted = { container, root };
  return container;
}

afterEach(() => {
  if (!mounted) return;
  const { container, root } = mounted;
  mounted = undefined;
  act(() => {
    root.unmount();
  });
  container.remove();
});

function items(container: HTMLElement): ReadonlyArray<HTMLDetailsElement> {
  return [...container.querySelectorAll<HTMLDetailsElement>("details[data-faq]")];
}

function questions(container: HTMLElement): ReadonlyArray<HTMLElement> {
  return [...container.querySelectorAll<HTMLElement>("details[data-faq] > summary")];
}

function press(target: HTMLElement, key: string): void {
  act(() => {
    target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  });
}

describe("the landing faq markup", () => {
  it("renders one native disclosure per item, its question an h3 inside the summary", async () => {
    const container = await render("en");
    expect(items(container).map((item) => item.dataset.faq)).toEqual([...FAQ_ITEM_IDS]);
    for (const summary of questions(container)) {
      expect(summary.querySelector("h3")).not.toBeNull();
    }
    expect(container.querySelector("button, [aria-expanded]")).toBeNull();
  });

  it("starts with every item closed and opens one through its summary without a script", async () => {
    const container = await render("en");
    expect(items(container).every((item) => !item.open)).toBe(true);
    act(() => questions(container)[0]?.click());
    expect(items(container)[0]?.open).toBe(true);
  });

  it("puts every answer into the server HTML", async () => {
    const markup = renderToStaticMarkup(await Faq({ locale: "en" }));
    for (const item of await faqContent("en")) {
      expect(markup).toContain(item.question.replace(/'/g, "&#x27;"));
    }
    expect(markup.match(/<details/g)).toHaveLength(FAQ_ITEM_IDS.length);
    expect(markup).not.toContain("<details open");
  });

  it("moves focus between the questions with the arrow keys, Home and End", async () => {
    const container = await render("en");
    const list = questions(container);
    list[0]?.focus();
    press(list[0] as HTMLElement, "ArrowDown");
    expect(document.activeElement).toBe(list[1]);
    press(list[1] as HTMLElement, "ArrowUp");
    expect(document.activeElement).toBe(list[0]);
    press(list[0] as HTMLElement, "ArrowUp");
    expect(document.activeElement).toBe(list.at(-1));
    press(list.at(-1) as HTMLElement, "Home");
    expect(document.activeElement).toBe(list[0]);
    press(list[0] as HTMLElement, "End");
    expect(document.activeElement).toBe(list.at(-1));
  });

  it("stays a server section with no client island, only a keyboard helper", () => {
    const read = (name: string) => readFileSync(new URL(name, import.meta.url), "utf8");
    expect(read("./faq.tsx")).not.toMatch(/^"use client"/);
    expect(read("./faq.tsx")).not.toContain("./islands");
    expect(read("./faq-keys.tsx")).toMatch(/^"use client"/);
  });
});

describe.each(i18n.languages)("the landing faq in %s", (locale) => {
  it("feeds the structured data exactly the questions and answers it renders", async () => {
    const container = await render(locale);
    const rendered = items(container).map((item) => ({
      question: item.querySelector("h3")?.textContent,
      answer: item.querySelector(".vk-faq-answer")?.textContent,
    }));
    const content = await faqContent(locale);
    expect(rendered).toEqual(content.map(({ question, answer }) => ({ question, answer })));
    const ld = faqPageLd({ items: content, lang: locale }) as {
      mainEntity: ReadonlyArray<{ name: string; acceptedAnswer: { text: string } }>;
    };
    expect(ld.mainEntity.map((entry) => entry.name)).toEqual(rendered.map((r) => r.question));
    expect(ld.mainEntity.map((entry) => entry.acceptedAnswer.text)).toEqual(
      rendered.map((r) => r.answer),
    );
  });

  it("prints no raw placeholder or tag", async () => {
    for (const { answer } of await faqContent(locale)) expect(answer).not.toMatch(/[{}<>]/);
  });

  it("links each answer to its docs page in the reader's locale", async () => {
    const container = await render(locale);
    for (const id of FAQ_ITEM_IDS) {
      const links = [
        ...container.querySelectorAll<HTMLAnchorElement>(`[data-faq="${id}"] .vk-faq-answer a`),
      ].filter((link) => link.getAttribute("href") !== LICENSE_URL);
      expect(
        links.map((link) => link.getAttribute("href")),
        id,
      ).toEqual([faqHref(locale, FAQ_ANSWER_LINKS[id])]);
    }
    const license = container.querySelector<HTMLAnchorElement>(`a[href="${LICENSE_URL}"]`);
    expect(license?.getAttribute("target")).toBe("_blank");
  });

  it("lists the docs links beside the heading in the reader's locale, with no arrow", async () => {
    const container = await render(locale);
    const nav = container.querySelector("nav[aria-labelledby='faq-docs-label']");
    const links = [...(nav?.querySelectorAll<HTMLAnchorElement>("a") ?? [])];
    expect(links.map((link) => link.getAttribute("href"))).toEqual(
      FAQ_ASIDE_LINKS.map(({ link }) => faqHref(locale, link)),
    );
    for (const link of links) expect(link.textContent).not.toMatch(/[←-⇿]/);
    if (locale !== i18n.defaultLanguage) {
      for (const link of links) expect(link.getAttribute("href")).toMatch(`/${locale}/`);
    }
  });

  it("names the providers in the published release, from the single source", async () => {
    const npm = (await faqContent(locale)).find((item) => item.id === "npm");
    expect(npm?.answer).toContain(PACKAGE_VERSION);
    for (const id of publishedProviders()) expect(npm?.answer).toContain(providerShortLabel(id));
  });
});

const YES: Readonly<Record<Locale, string>> = { en: "Yes.", de: "Ja.", es: "Sí.", fr: "Oui." };
const NO: Readonly<Record<Locale, string>> = { en: "No.", de: "Nein.", es: "No.", fr: "Non." };

describe("the landing faq copy", () => {
  it.each(i18n.languages)("keeps the items in the rendered order in %s", (locale) => {
    expect(Object.keys(CATALOGS[locale].landing.faq.items)).toEqual([...FAQ_ITEM_IDS]);
  });

  it.each(i18n.languages)(
    "gives every answer one docs link and uses no other tag than link and license in %s",
    (locale) => {
      for (const [id, { answer }] of Object.entries(CATALOGS[locale].landing.faq.items)) {
        expect(answer.match(/<link>/g), id).toHaveLength(1);
        const tags = new Set([...answer.matchAll(/<(\w+)>/g)].map((match) => match[1]));
        expect(
          [...tags].every((tag) => tag === "link" || tag === "license"),
          id,
        ).toBe(true);
      }
    },
  );

  it.each(i18n.languages)("opens the yes and no questions with the answer in %s", (locale) => {
    const faq = CATALOGS[locale].landing.faq.items;
    expect(faq.ci.answer.startsWith(YES[locale])).toBe(true);
    expect(faq.studio.answer.startsWith(NO[locale])).toBe(true);
    expect(faq.playground.answer.startsWith(NO[locale])).toBe(true);
  });

  it.each(i18n.languages)(
    "keeps every answer to the answer and at most two more sentences in %s",
    (locale) => {
      for (const [id, { answer }] of Object.entries(CATALOGS[locale].landing.faq.items)) {
        const sentences = answer
          .replace(/\{pending,.*other \{\}\}/, "")
          .split(/[.!?](?:\s|$)/)
          .filter((part) => part.trim() !== "");
        expect(sentences.length, id).toBeLessThanOrEqual(3);
      }
    },
  );
});
