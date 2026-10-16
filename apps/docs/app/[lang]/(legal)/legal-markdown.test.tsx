// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createTranslator } from "next-intl";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { i18n } from "@/lib/i18n";
import { LICENSES } from "@/lib/licenses-manifest";

const MESSAGES_DIR = join(import.meta.dirname, "../../../messages");

function messagesOf(locale: string) {
  return JSON.parse(readFileSync(join(MESSAGES_DIR, `${locale}.json`), "utf8"));
}

vi.mock("next-intl/server", () => ({
  setRequestLocale: () => undefined,
  getTranslations: async ({ locale, namespace }: { locale: string; namespace: string }) =>
    createTranslator({ locale, messages: messagesOf(locale), namespace: namespace as never }),
}));

const { contactMarkdown, imprintMarkdown, licensesMarkdown, privacyMarkdown } = await import(
  "@/lib/legal-markdown"
);
const { default: ImprintPage } = await import("./imprint/page");
const { default: PrivacyPage } = await import("./privacy/page");

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
      blockText(doc, "article > h1, article > h2, article > p"),
    );
  });

  it("carries exactly the text of the privacy policy, without the opt-out control", async () => {
    const doc = await rendered(PrivacyPage, lang);
    doc.querySelector("section form")?.closest(".not-prose")?.remove();
    expect(markdownText(await privacyMarkdown(lang))).toBe(
      blockText(doc, "article > h1, article > p, article section h2, article section p"),
    );
  });

  it("carries the contact page heading and intro and links the form", async () => {
    const t = createTranslator({
      locale: lang,
      messages: messagesOf(lang),
      namespace: "legal.contact",
    });
    const plainTag = (chunks: string) => chunks;
    const body = await contactMarkdown(lang);
    const text = markdownText(body);
    expect(text).toContain(`${t("title")} ${t.markup("intro", { imprint: plainTag })}`);
    expect(text).toContain(t.markup("privacyNotice", { privacy: plainTag }));
    const contact = lang === "en" ? "/contact" : `/${lang}/contact`;
    expect(body).toContain(`](https://verbatra.kreitz-webdev.de${contact})`);
  });

  it("lists every package, asset and license text of the licenses page", async () => {
    const body = await licensesMarkdown(lang);
    for (const group of LICENSES.groups) {
      expect(body).toContain(`## ${group.license} (`);
      for (const pkg of group.packages) expect(body).toContain(`\`${pkg.name}@${pkg.version}\``);
    }
    for (const asset of LICENSES.assets) expect(body).toContain(`**${asset.name}**`);
    for (const text of LICENSES.texts) expect(body).toContain(`### License text ${text.id} (`);
  });
});
