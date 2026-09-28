// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createTranslator, NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { i18n, type Locale } from "@/lib/i18n";

const MESSAGES_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../messages");

function loadMessages(locale: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(MESSAGES_DIR, `${locale}.json`), "utf8"));
}

vi.mock("next-intl/server", () => ({
  getTranslations: async ({ locale, namespace }: { locale: string; namespace: string }) =>
    createTranslator({ locale, messages: loadMessages(locale), namespace: namespace as never }),
}));

type LegalPage = (props: { params: Promise<{ lang: string }> }) => Promise<ReactNode>;

const LEGAL_PAGES: ReadonlyArray<readonly [string, LegalPage]> = [
  ["imprint", (await import("./imprint/page")).default],
  ["privacy", (await import("./privacy/page")).default],
  ["contact", (await import("./contact/page")).default],
];

interface RetiredClaim {
  readonly claim: string;
  readonly pattern: RegExp;
  readonly sample: string;
}

const RETIRED_CLAIMS: readonly RetiredClaim[] = [
  {
    claim: "English privacy policy prevails over its translations",
    pattern:
      /English version prevails|englische Fassung maßgeblich|prevalece la versión en inglés|version anglaise prévaut/,
    sample: "In case of any discrepancy, the English version prevails.",
  },
  {
    claim: "repealed Telemediengesetz",
    pattern: /\bTMG\b|Telemediengesetz/,
    sample: "Angaben gemäß § 5 TMG",
  },
  {
    claim: "repealed TTDSG",
    pattern: /\bTTDSG\b|Telekommunikation-Telemedien-Datenschutz-Gesetz/,
    sample: "Einwilligung nach § 25 TTDSG",
  },
  {
    claim: "one-hour Arcjet retention",
    pattern: /\b(one hour|einer Stunde|una hora|une heure)\b/,
    sample: "Arcjet keeps this data for one hour",
  },
  {
    claim: "Arcjet as the only processor overall",
    pattern: /only third-party processor|Der einzige beteiligte Auftragsverarbeiter/,
    sample: "Arcjet is the only third-party processor",
  },
  {
    claim: "Umami collects no personal data",
    pattern:
      /does not collect personal data|erhebt keine personenbezogenen Daten|no recopila datos personales|ne collecte pas de données personnelles/,
    sample: "Umami erhebt keine personenbezogenen Daten",
  },
  {
    claim: "logs kept only for a short period",
    pattern:
      /only for a short period|nur für einen kurzen Zeitraum|solo durante un periodo breve|que pour une courte période/,
    sample: "Logs are stored only for a short period",
  },
  {
    claim: "every translation reviewed before publication",
    pattern:
      /reviewed before publication|vor der Veröffentlichung geprüft|se revisa antes de publicarse|relu avant sa publication/,
    sample: "Each translation is reviewed before publication",
  },
  {
    claim: "AI translation note given without a legal duty",
    pattern:
      /not because a specific legal disclosure requirement|nicht weil dafür eine bestimmte gesetzliche|no porque se aplique una obligación legal|non parce qu'une obligation légale/,
    sample: "not because a specific legal disclosure requirement applies",
  },
];

async function renderedText(page: LegalPage, locale: Locale): Promise<string> {
  const markup = renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={loadMessages(locale)}>
      {await page({ params: Promise.resolve({ lang: locale }) })}
    </NextIntlClientProvider>,
  );
  const doc = new DOMParser().parseFromString(markup.replaceAll("><", "> <"), "text/html");
  const hrefs = Array.from(doc.querySelectorAll("[href]"), (node) => node.getAttribute("href"));
  return [doc.body.textContent ?? "", ...hrefs].join(" ").replace(/\s+/g, " ");
}

describe.each(i18n.languages)("legal pages: retired claims (%s)", (locale) => {
  it.each(LEGAL_PAGES)("the %s page repeats none of them", async (_name, page) => {
    const text = await renderedText(page, locale);
    const found = RETIRED_CLAIMS.filter(({ pattern }) => pattern.test(text)).map(
      ({ claim }) => claim,
    );

    expect(found).toEqual([]);
  });
});

describe("legal pages: retired claim patterns", () => {
  it.each(RETIRED_CLAIMS)("catch the $claim wording", ({ pattern, sample }) => {
    expect(sample).toMatch(pattern);
  });
});
