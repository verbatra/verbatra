// @vitest-environment jsdom

import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { i18n } from "@/lib/i18n";
import { SITE_URL } from "@/lib/site-url";

vi.mock(
  "next-intl/server",
  async () => (await import("@/test-support/catalog-intl")).catalogIntlServer,
);

vi.mock("@/components/contact-form", () => ({
  ContactForm: ({ privacyNotice }: { privacyNotice: ReactNode }) => <p>{privacyNotice}</p>,
}));

const { contactMarkdown, imprintMarkdown, licensesMarkdown, privacyMarkdown } = await import(
  "@/lib/legal-markdown"
);
const { default: ImprintPage } = await import("./imprint/page");
const { default: PrivacyPage } = await import("./privacy/page");
const { default: ContactPage } = await import("./contact/page");
const { default: LicensesPage } = await import("./licenses/page");

type Page = (props: { params: Promise<{ lang: string }> }) => Promise<ReactNode>;

async function rendered(page: Page, lang: string): Promise<Document> {
  const html = renderToStaticMarkup(await page({ params: Promise.resolve({ lang }) }));
  return new DOMParser().parseFromString(html, "text/html");
}

function blockText(doc: Document, selector: string): string {
  for (const br of doc.querySelectorAll("br")) br.replaceWith(" ");
  return normalized(
    Array.from(doc.querySelectorAll(selector), (node) => node.textContent ?? "").join(" "),
  );
}

function blocks(doc: Document, selector: string): string[] {
  for (const br of doc.querySelectorAll("br")) br.replaceWith(" ");
  for (const element of doc.querySelectorAll("article *")) element.after(" ");
  return Array.from(doc.querySelectorAll(selector))
    .filter((node) => node.querySelector(selector) === null)
    .map((node) => normalized(node.textContent ?? ""))
    .filter((text) => text.length > 0);
}

function words(text: string): string {
  return normalized(text.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[#.,;:()*`"]/g, " "));
}

function normalized(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function markdownText(markdown: string): string {
  return normalized(
    markdown
      .replace(/^---\n[\s\S]*?\n---\n/, "")
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/^#+ /gm, "")
      .replace(/^> /gm, "")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/^\*(.*)\*$/gm, "$1"),
  );
}

describe.each(i18n.languages)("legal markdown in %s", (lang) => {
  it("carries exactly the text of the imprint page", async () => {
    const doc = await rendered(ImprintPage, lang);
    expect(markdownText(await imprintMarkdown(lang))).toBe(
      blockText(doc, "article h1, article > header > .vk-page-lead, article > h2, article > p"),
    );
  });

  it("carries exactly the text of the privacy policy, without the opt-out control", async () => {
    const doc = await rendered(PrivacyPage, lang);
    doc.querySelector("section form")?.closest(".not-prose")?.remove();
    expect(markdownText(await privacyMarkdown(lang))).toBe(
      blockText(doc, "article h1, article > p, article section h2, article section p"),
    );
  });

  it("carries every heading and paragraph of the contact page and links the form", async () => {
    const doc = await rendered(ContactPage, lang);
    const body = await contactMarkdown(lang);
    const text = words(body);
    const found = blocks(doc, "article h1, article p");
    expect(found.length).toBeGreaterThanOrEqual(3);
    for (const block of found) expect(text).toContain(words(block));
    const contact = lang === "en" ? "/contact" : `/${lang}/contact`;
    expect(body).toContain(`](${SITE_URL}${contact})`);
  });

  it("carries every heading, paragraph, list item and license text of the licenses page", async () => {
    const doc = await rendered(LicensesPage, lang);
    doc.querySelector(".vk-page-eyebrow")?.remove();
    doc.querySelector(".vk-legal-jump")?.remove();
    const text = words(await licensesMarkdown(lang));
    const found = blocks(
      doc,
      "article h1, article h2, article h3, article p, article li, article pre",
    );
    expect(found.length).toBeGreaterThan(20);
    const missing = found.filter((block) => !text.includes(words(block)));
    expect(missing).toEqual([]);
  });
});
