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
  setRequestLocale: () => undefined,
  getTranslations: async ({ locale, namespace }: { locale: string; namespace: string }) =>
    createTranslator({ locale, messages: loadMessages(locale), namespace: namespace as never }),
}));

type LegalPage = (props: { params: Promise<{ lang: string }> }) => Promise<ReactNode>;

const LEGAL_PAGES: ReadonlyArray<readonly [string, LegalPage]> = [
  ["imprint", (await import("./imprint/page")).default],
  ["privacy", (await import("./privacy/page")).default],
  ["contact", (await import("./contact/page")).default],
  ["licenses", (await import("./licenses/page")).default],
];

interface RetiredClaim {
  readonly claim: string;
  readonly pattern: RegExp;
  readonly sample: string;
  readonly portugueseSample?: string;
  readonly japaneseSample?: string;
}

const RETIRED_CLAIMS: readonly RetiredClaim[] = [
  {
    claim: "liability disclaimer for own content",
    pattern: /Haftung für Inhalte|§\s*7\s*Abs\.\s*1\s*DDG|§§\s*8\s*bis\s*10\s*DDG/,
    sample: "Als Diensteanbieter sind wir gemäß § 7 Abs. 1 DDG für eigene Inhalte verantwortlich.",
  },
  {
    claim: "liability disclaimer for external links",
    pattern: /Haftung für Links|zum Zeitpunkt der Verlinkung/,
    sample: "Haftung für Links",
  },
  {
    claim: "copyright clause requiring written consent despite the MIT license",
    pattern: /schriftlichen Zustimmung|jede Art der Verwertung/,
    sample: "bedürfen der schriftlichen Zustimmung des jeweiligen Autors bzw. Erstellers",
  },
  {
    claim: "German law requires the imprint in German",
    pattern:
      /required by German law|nach deutschem Recht erforderlich|exige la ley alemana|l'exige la loi allemande|exigido pela lei alemã|exigida pela lei alemã|ドイツの法律で必要/,
    sample: "This legal notice (Impressum) is provided in German as required by German law.",
    portugueseSample:
      "Este aviso legal (Impressum) é fornecido em alemão, conforme exigido pela lei alemã.",
    japaneseSample:
      "この運営者情報（Impressum）は、ドイツの法律で必要とされているためドイツ語で提供しています。",
  },
  {
    claim: "commercial imprint basis under § 5 DDG",
    pattern: /§\s*5\s*DDG/,
    sample: "Angaben gemäß § 5 DDG",
  },
  {
    claim: "imprint heading citing a specific imprint law",
    pattern: /Angaben gemäß/,
    sample: "Angaben gemäß § 18 Abs. 1 MStV",
  },
  {
    claim: "non-commercial classification note on the imprint",
    pattern:
      /nicht-kommerziellen Open-Source-Projekts|keine Waren oder Dienstleistungen gegen Entgelt/,
    sample:
      "Diese Website ist die Dokumentation des nicht-kommerziellen Open-Source-Projekts verbatra.",
  },
  {
    claim: "separate § 18 Abs. 2 MStV editorial responsibility block",
    pattern: /§\s*18\s*Abs\.\s*2\s*MStV|Verantwortlich für den Inhalt/,
    sample: "Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV",
  },
  {
    claim: "commercial or tax law retention of contact enquiries (HGB, AO)",
    pattern: /\bHGB\b|\(HGB|Handelsgesetzbuch|Abgabenordnung|Commercial Code|Fiscal Code/,
    sample: "unless statutory retention duties under German commercial or tax law (HGB or AO)",
  },
  {
    claim: "open-ended legal retention of contact enquiries",
    pattern:
      /unless we are legally required to keep them|gesetzlich zur Aufbewahrung verpflichtet|la ley nos obligue a conservarlos|la loi nous oblige à les conserver|a menos que a lei nos obrigue a mantê-los|法律で保存が義務付けられていない限り/,
    sample: "delete them once it has been handled, unless we are legally required to keep them",
    portugueseSample:
      "Os dados são excluídos após o atendimento, a menos que a lei nos obrigue a mantê-los.",
    japaneseSample: "データは、法律で保存が義務付けられていない限り、対応後に削除します。",
  },
  {
    claim: "consumer dispute resolution statement (§ 36 VSBG)",
    pattern: /Verbraucherstreitbeilegung|Verbraucherschlichtungsstelle|\bVSBG\b/,
    sample:
      "Wir sind nicht bereit und nicht verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen.",
  },
  {
    claim: "English privacy policy prevails over its translations",
    pattern:
      /English version prevails|englische Fassung maßgeblich|prevalece la versión en inglés|version anglaise prévaut|a versão em inglês prevalece|英語版が優先/,
    sample: "In case of any discrepancy, the English version prevails.",
    portugueseSample: "Em caso de divergência, a versão em inglês prevalece.",
    japaneseSample: "内容に相違がある場合は、英語版が優先されます。",
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
    pattern: /\b(one hour|einer Stunde|una hora|une heure|uma hora)\b|1 時間/,
    sample: "Arcjet keeps this data for one hour",
    portugueseSample: "A Arcjet retém esses dados por uma hora.",
    japaneseSample: "Arcjet はこのデータを 1 時間保持します。",
  },
  {
    claim: "Arcjet as the only processor overall",
    pattern:
      /only third-party processor|Der einzige beteiligte Auftragsverarbeiter|único operador terceirizado|唯一の処理者|処理者は Arcjet だけ/,
    sample: "Arcjet is the only third-party processor",
    portugueseSample: "A Arcjet é o único operador terceirizado.",
    japaneseSample: "関与する処理者は Arcjet だけです。",
  },
  {
    claim: "Umami collects no personal data",
    pattern:
      /does not collect personal data|erhebt keine personenbezogenen Daten|no recopila datos personales|ne collecte pas de données personnelles|não coleta dados pessoais|個人データを収集しません/,
    sample: "Umami erhebt keine personenbezogenen Daten",
    portugueseSample: "O Umami não coleta dados pessoais.",
    japaneseSample: "Umami は個人データを収集しません。",
  },
  {
    claim: "Umami writes nothing to the device",
    pattern:
      /writes nothing to your device|schreibt nichts auf dein Gerät|ni escribe nada en tu dispositivo|n'écrit rien sur ton appareil|não grava nada no seu dispositivo|デバイスには何も書き込みません/,
    sample: "Umami sets no cookies and writes nothing to your device",
    portugueseSample: "O Umami não define cookies e não grava nada no seu dispositivo.",
    japaneseSample: "Umami は Cookie を設定せず、デバイスには何も書き込みません。",
  },
  {
    claim: "local storage opt-out under umami.disabled",
    pattern: /umami\.disabled/,
    sample: "it saves the entry umami.disabled in your browser's local storage",
  },
  {
    claim: "no analytics script runs in the browser, stated without the consent choice",
    pattern:
      /(^|\. )No analytics script runs in your browser|(^|\. )In deinem Browser läuft kein Analyseskript|(^|\. )En tu navegador no se ejecuta ningún script de analítica|(^|\. )Aucun script de statistiques ne s’exécute dans ton navigateur|(^|。)你的浏览器中不运行任何分析脚本|(^|\. )Nenhum script de análise é executado no seu navegador|(^|。)ブラウザーで分析スクリプトは動作せず|and no analytics script runs in your browser|und in deinem Browser läuft kein Analyseskript|y en tu navegador no se ejecuta ningún script de analítica|et aucun script de statistiques ne s’exécute dans ton navigateur|你的浏览器中也不运行分析脚本|e nenhum script de análise é executado no seu navegador|ブラウザーで分析スクリプトも動作しません/,
    sample: "No analytics script runs in your browser, and nothing is written to your device.",
    portugueseSample:
      "Nenhum script de análise é executado no seu navegador, e nada é gravado no seu dispositivo.",
    japaneseSample: "ブラウザーで分析スクリプトは動作せず、デバイスへ書き込むものもありません。",
  },
  {
    claim: "no cookie consent banner is required",
    pattern:
      /no cookie consent banner is required|kein Cookie-Einwilligungsbanner erforderlich|no se necesita ningún banner de consentimiento de cookies|aucune bannière de consentement aux cookies n’est requise|不需要 Cookie 同意横幅|não é necessário um banner de consentimento de cookies|Cookie 同意バナーは不要です/,
    sample:
      "Because nothing requiring consent is stored on your device, no cookie consent banner is required.",
    portugueseSample:
      "Como nada que exija consentimento é armazenado no seu dispositivo, não é necessário um banner de consentimento de cookies.",
    japaneseSample: "同意が必要なものはデバイスに保存されないため、Cookie 同意バナーは不要です。",
  },
  {
    claim: "site sets no cookies at all",
    pattern:
      /sets no cookies|setzt keine Cookies|no establece cookies|ne dépose aucun cookie|não define cookies|Cookie を一切設定しません/,
    sample: "This site sets no cookies.",
    portugueseSample: "Este site não define cookies.",
    japaneseSample: "このサイトは Cookie を一切設定しません。",
  },
  {
    claim: "logs kept only for a short period",
    pattern:
      /only for a short period|nur für einen kurzen Zeitraum|solo durante un periodo breve|que pour une courte période|só por um curto período|apenas por um curto período|短期間だけ/,
    sample: "Logs are stored only for a short period",
    portugueseSample: "Os logs são armazenados apenas por um curto período.",
    japaneseSample: "ログは短期間だけ保存されます。",
  },
  {
    claim: "every translation reviewed before publication",
    pattern:
      /reviewed before publication|vor der Veröffentlichung geprüft|se revisa antes de publicarse|relu avant sa publication|revisada antes da publicação|revisado antes da publicação|公開前にレビューされ/,
    sample: "Each translation is reviewed before publication",
    portugueseSample: "Cada tradução é revisada antes da publicação.",
    japaneseSample: "各翻訳は公開前にレビューされます。",
  },
  {
    claim: "AI translation note given without a legal duty",
    pattern:
      /not because a specific legal disclosure requirement|nicht weil dafür eine bestimmte gesetzliche|no porque se aplique una obligación legal|non parce qu'une obligation légale|não porque um requisito legal específico|特定の法的要件があるからではなく/,
    sample: "not because a specific legal disclosure requirement applies",
    portugueseSample: "Este aviso existe, não porque um requisito legal específico se aplique.",
    japaneseSample:
      "この注記は、特定の法的要件があるからではなく、読者への配慮として載せています。",
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

  const PORTUGUESE_CLAIMS = RETIRED_CLAIMS.filter((entry) => entry.portugueseSample !== undefined);

  it("covers the thirteen claims with a per-language pattern in Portuguese", () => {
    expect(PORTUGUESE_CLAIMS).toHaveLength(13);
  });

  it.each(PORTUGUESE_CLAIMS)(
    "catch the Portuguese $claim wording",
    ({ pattern, portugueseSample }) => {
      expect(portugueseSample).toMatch(pattern);
    },
  );

  const JAPANESE_CLAIMS = RETIRED_CLAIMS.filter((entry) => entry.japaneseSample !== undefined);

  it("covers the same thirteen claims with a Japanese pattern", () => {
    expect(JAPANESE_CLAIMS.map(({ claim }) => claim)).toEqual(
      PORTUGUESE_CLAIMS.map(({ claim }) => claim),
    );
  });

  it.each(JAPANESE_CLAIMS)("catch the Japanese $claim wording", ({ pattern, japaneseSample }) => {
    expect(japaneseSample).toMatch(pattern);
  });
});
