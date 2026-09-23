// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { i18n, type Locale } from "@/lib/i18n";

const MESSAGES_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../../messages");

function loadMessages(locale: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(MESSAGES_DIR, `${locale}.json`), "utf8"));
}

vi.mock("next-intl/server", () => ({
  getTranslations: async ({ locale, namespace }: { locale: string; namespace: string }) =>
    createTranslator({ locale, messages: loadMessages(locale), namespace: namespace as never }),
}));

const { default: ContactPage } = await import("./page");
const { default: PrivacyPage } = await import("../privacy/page");

async function renderContact(locale: Locale): Promise<Document> {
  const page = await ContactPage({ params: Promise.resolve({ lang: locale }) });
  const markup = renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={loadMessages(locale)}>
      {page}
    </NextIntlClientProvider>,
  );
  return new DOMParser().parseFromString(markup, "text/html");
}

async function renderPrivacy(locale: Locale): Promise<Document> {
  const page = await PrivacyPage({ params: Promise.resolve({ lang: locale }) });
  return new DOMParser().parseFromString(renderToStaticMarkup(page), "text/html");
}

function privacyPath(locale: Locale): string {
  return locale === "en" ? "/privacy" : `/${locale}/privacy`;
}

const DELETION_RULE: Record<Locale, RegExp> = {
  en: /deleted once your inquiry has been fully handled, unless statutory retention duties/,
  de: /gelöscht, sobald deine Anfrage abschließend bearbeitet ist, es sei denn/,
  es: /Se eliminan una vez que tu consulta se ha gestionado por completo, salvo que/,
  fr: /supprimés dès que ta demande a été entièrement traitée, sauf si/,
};

const NOTICE_DELETION: Record<Locale, RegExp> = {
  en: /delete them once it has been handled, unless we are legally required to keep them/,
  de: /löschen sie, sobald die Anfrage erledigt ist, es sei denn, wir sind gesetzlich zur Aufbewahrung verpflichtet/,
  es: /los eliminamos una vez gestionada, salvo que la ley nos obligue a conservarlos/,
  fr: /nous les supprimons une fois celle-ci traitée, sauf si la loi nous oblige à les conserver/,
};

describe.each(i18n.languages)("contact page privacy notice (%s)", (locale) => {
  it("sits directly below the submit button and links to the contact form section of the privacy policy", async () => {
    const doc = await renderContact(locale);
    const notice = doc.querySelector('button[type="submit"]')?.nextElementSibling;
    const link = notice?.querySelector("a");

    expect(notice?.textContent).toMatch(NOTICE_DELETION[locale]);
    expect(link?.getAttribute("href")).toBe(`${privacyPath(locale)}#contact-form`);
    expect(link?.textContent?.trim()).not.toBe("");
  });

  it("points at a privacy policy section that exists and covers the contact form", async () => {
    const doc = await renderPrivacy(locale);
    const target = doc.getElementById("contact-form");
    const section = target?.closest("section")?.textContent?.replace(/\s+/g, " ") ?? "";

    expect(target?.tagName).toBe("H2");
    expect(target?.textContent).toMatch(/^12\. /);
    expect(section).toMatch(DELETION_RULE[locale]);
    expect(section).toMatch(/HGB/);
    expect(section).toMatch(/AO\b/);
  });
});
