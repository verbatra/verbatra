// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createTranslator } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { i18n, type Locale } from "@/lib/i18n";

const HERE = dirname(fileURLToPath(import.meta.url));
const MESSAGES_DIR = join(HERE, "../../../../messages");
const IMPRINT_PAGE = join(HERE, "../imprint/page.tsx");

function loadMessages(locale: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(MESSAGES_DIR, `${locale}.json`), "utf8"));
}

vi.mock("next-intl/server", () => ({
  getTranslations: async ({ locale, namespace }: { locale: string; namespace: string }) =>
    createTranslator({ locale, messages: loadMessages(locale), namespace: namespace as never }),
}));

const { default: PrivacyPage } = await import("./page");

async function renderPrivacy(locale: Locale): Promise<Document> {
  const page = await PrivacyPage({ params: Promise.resolve({ lang: locale }) });
  return new DOMParser().parseFromString(renderToStaticMarkup(page), "text/html");
}

function sectionText(doc: Document, heading: RegExp): string {
  const h2 = Array.from(doc.querySelectorAll("h2")).find((node) =>
    heading.test(node.textContent ?? ""),
  );
  return h2?.closest("section")?.textContent?.replace(/\s+/g, " ") ?? "";
}

function expectedHref(locale: Locale, path: string): string {
  return locale === "en" ? path : `/${locale}${path}`;
}

function sectionNumbered(doc: Document, n: number): Element | null {
  return (
    Array.from(doc.querySelectorAll("h2"))
      .find((node) => node.textContent?.startsWith(`${n}. `))
      ?.closest("section") ?? null
  );
}

const NO_DPO_PHRASE: Record<Locale, RegExp> = {
  en: /No data protection officer has been appointed/,
  de: /Ein Datenschutzbeauftragter ist nicht benannt/,
  es: /No se ha designado un delegado de protección de datos/,
  fr: /Aucun délégué à la protection des données n'a été désigné/,
};

const OBJECTION_CROSS_REFERENCE: Record<Locale, RegExp> = {
  en: /\bsection 9\b/,
  de: /\bAbschnitt 9\b/,
  es: /\bsección 9\b/,
  fr: /\bsection 9\b/,
};

const ARCJET_RETENTION: Record<Locale, RegExp> = {
  en: /retains this request data for 30 days and retains aggregated data derived from it for longer/,
  de: /speichert Arcjet diese Anfragedaten 30 Tage lang und daraus abgeleitete aggregierte Daten länger/,
  es: /conserva estos datos de la solicitud durante 30 días y conserva durante más tiempo los datos agregados/,
  fr: /conserve ces données de requête pendant 30 jours et conserve plus longtemps les données agrégées/,
};

const ARCJET_THIRD_COUNTRY: Record<Locale, RegExp> = {
  en: /transferred to the United States, a third country \(Art\. 44 ff\. GDPR\)/,
  de: /in die USA, ein Drittland, übermittelt werden \(Art\. 44 ff\. DSGVO\)/,
  es: /transferirse a Estados Unidos, un tercer país \(art\. 44 y ss\. del RGPD\)/,
  fr: /transférées vers les États-Unis, un pays tiers \(art\. 44 et suivants du RGPD\)/,
};

const ARCJET_SAFEGUARD: Record<Locale, RegExp> = {
  en: /not certified under the EU-U\.S\. Data Privacy Framework.*EU Standard Contractual Clauses \(Art\. 46\(2\)\(c\) GDPR\)/,
  de: /nicht unter dem EU-US-Datenschutzrahmen zertifiziert.*EU-Standardvertragsklauseln \(Art\. 46 Abs\. 2 lit\. c DSGVO\)/,
  es: /no está certificada en el marco del EU-U\.S\. Data Privacy Framework.*cláusulas contractuales tipo de la UE \(art\. 46\.2\.c\) del RGPD\)/,
  fr: /n'est pas certifiée au titre de l'EU-U\.S\. Data Privacy Framework.*clauses contractuelles types de l'UE \(art\. 46, § 2, point c\) du RGPD\)/,
};

const UMAMI_NOT_STORED: Record<Locale, RegExp> = {
  en: /Your IP address and user-agent string themselves are not stored\./,
  de: /Deine IP-Adresse und deine User-Agent-Zeichenkette selbst werden nicht gespeichert\./,
  es: /Tu dirección IP y tu cadena de user-agent en sí no se almacenan\./,
  fr: /Ton adresse IP et ta chaîne user-agent elles-mêmes ne sont pas conservées\./,
};

const UMAMI_PSEUDONYMOUS: Record<Locale, RegExp> = {
  en: /pseudonymous session identifier by hashing/,
  de: /pseudonyme Sitzungskennung/,
  es: /identificador de sesión seudónimo/,
  fr: /identifiant de session pseudonyme/,
};

const UMAMI_SAME_SERVER: Record<Locale, RegExp> = {
  en: /same server as this site \(see section 3\)/,
  de: /demselben Server wie diese Seite hosten \(siehe Abschnitt 3\)/,
  es: /mismo servidor que este sitio \(ver la sección 3\)/,
  fr: /même serveur que ce site \(voir la section 3\)/,
};

const UMAMI_DEVICE_READS: Record<Locale, RegExp> = {
  en: /screen size and your browser language/,
  de: /Bildschirmgröße und deine Browsersprache/,
  es: /tamaño de tu pantalla y el idioma de tu navegador/,
  fr: /taille de ton écran et la langue de ton navigateur/,
};

const UMAMI_EVENT_PAYLOADS: Record<Locale, ReadonlyArray<RegExp>> = {
  en: [
    /copying a command or prompt \(with the copied command text/,
    /previous and the newly selected language/,
  ],
  de: [
    /Kopieren eines Befehls oder Prompts \(mit dem kopierten Befehlstext/,
    /bisherigen und der neu gewählten Sprache/,
  ],
  es: [
    /copiar un comando o un prompt \(con el texto del comando copiado/,
    /idioma anterior y el recién seleccionado/,
  ],
  fr: [
    /copier une commande ou un prompt \(avec le texte de la commande copiée/,
    /langue précédente et la langue nouvellement sélectionnée/,
  ],
};

const HOSTING_PROCESSOR: Record<Locale, RegExp> = {
  en: /Contabo GmbH, Welfenstraße 22, 81541 Munich, Germany.*as a processor \(Art\. 28 GDPR\)/,
  de: /Contabo GmbH, Welfenstraße 22, 81541 München, Deutschland.*als Auftragsverarbeiter \(Art\. 28 DSGVO\)/,
  es: /Contabo GmbH, Welfenstraße 22, 81541 Múnich, Alemania.*como encargado del tratamiento \(art\. 28 del RGPD\)/,
  fr: /Contabo GmbH, Welfenstraße 22, 81541 Munich, Allemagne.*en tant que sous-traitant \(art\. 28 du RGPD\)/,
};

const CONTAINER_LOG_ROTATION: Record<Locale, RegExp> = {
  en: /container log is rotated automatically and limited to \d+ files of \d+ MB each/,
  de: /Container-Log wird automatisch rotiert und ist auf \d+ Dateien mit je \d+ MB begrenzt/,
  es: /registro del contenedor se rota automáticamente y está limitado a \d+ archivos de \d+ MB cada uno/,
  fr: /journal du conteneur fait l'objet d'une rotation automatique et est limité à \d+ fichiers de \d+ Mo chacun/,
};

const ARCJET_ONLY_OTHER_PROCESSOR: Record<Locale, RegExp> = {
  en: /Besides the hosting provider \(see section 3\), the only processor involved under Art\. 28 GDPR is Arcjet/,
  de: /Neben dem Hosting-Anbieter \(siehe Abschnitt 3\) ist der einzige beteiligte Auftragsverarbeiter nach Art\. 28 DSGVO Arcjet/,
  es: /Aparte del proveedor de alojamiento \(ver la sección 3\), el único encargado del tratamiento en el sentido del art\. 28 del RGPD es Arcjet/,
  fr: /Outre l'hébergeur \(voir la section 3\), le seul sous-traitant au sens de l'art\. 28 du RGPD est Arcjet/,
};

const ACCESS_LOG_DELETION: Record<Locale, RegExp> = {
  en: /access logs are deleted as soon as they are no longer needed/,
  de: /Zugriffs-Logs des Webservers werden gelöscht, sobald sie für diese Zwecke nicht mehr benötigt werden/,
  es: /registros de acceso del servidor web se eliminan en cuanto dejan de ser necesarios/,
  fr: /journaux d'accès du serveur web sont supprimés dès qu'ils ne sont plus nécessaires/,
};

const AI_TRANSLATION_PIPELINE: Record<Locale, RegExp> = {
  en: /machine-translated into German, Spanish, and French by verbatra with Google's Gemini/,
  de: /von verbatra mit dem Sprachmodell Gemini von Google maschinell/,
  es: /verbatra traduce automáticamente .* con el modelo de lenguaje Gemini de Google/,
  fr: /traduits automatiquement .* par verbatra avec le modèle de langage Gemini de Google/,
};

const AI_TRANSLATION_BEST_EFFORT: Record<Locale, RegExp> = {
  en: /checked on a best-effort basis: not every translated text is reviewed by a person/,
  de: /nach bestem Bemühen geprüft: Nicht jeder übersetzte Text wird .* von einem Menschen/,
  es: /se revisan en la medida de lo posible: no todos los textos traducidos los revisa una persona/,
  fr: /vérifiées dans la mesure du possible : tous les textes traduits ne sont pas relus par une personne/,
};

function imprintFacts(): string[] {
  const source = readFileSync(IMPRINT_PAGE, "utf8")
    .replaceAll("&ouml;", "ö")
    .replaceAll("&szlig;", "ß");
  const street = source.match(/Mönchfeldstraße \d+/)?.[0];
  const city = source.match(/\d{5} Stuttgart/)?.[0];
  return [street ?? "missing street", city ?? "missing city"];
}

const EQUALLY_BINDING: Record<Locale, RegExp> = {
  en: /All four language versions have the same content and are equally binding\./,
  de: /Alle vier Sprachfassungen sind inhaltlich gleich und gleichermaßen verbindlich\./,
  es: /Las cuatro versiones lingüísticas tienen el mismo contenido y son igualmente vinculantes\./,
  fr: /Les quatre versions linguistiques ont le même contenu et font également foi\./,
};

describe.each(i18n.languages)("privacy page (%s)", (locale) => {
  it("states that every language version is equally binding", async () => {
    const doc = await renderPrivacy(locale);
    const beforeSections = Array.from(
      doc.querySelectorAll("article > p"),
      (node) => node.textContent,
    )
      .slice(0, 2)
      .join(" ");

    expect(beforeSections).toMatch(EQUALLY_BINDING[locale]);
  });

  it("numbers its thirteen headings in order", async () => {
    const doc = await renderPrivacy(locale);
    const numbers = Array.from(doc.querySelectorAll("h2")).map((node) =>
      Number.parseInt(node.textContent ?? "", 10),
    );

    expect(numbers).toEqual(Array.from({ length: 13 }, (_, index) => index + 1));
  });

  it("names the controller with the same postal address as the imprint and links to it", async () => {
    const doc = await renderPrivacy(locale);
    const controller = sectionText(doc, /^1\. /);

    for (const fact of imprintFacts()) {
      expect(controller).toContain(fact);
    }
    expect(
      sectionNumbered(doc, 1)?.querySelector(`a[href="${expectedHref(locale, "/imprint")}"]`),
    ).not.toBeNull();
  });

  it("states that no data protection officer is appointed", async () => {
    const controller = sectionText(await renderPrivacy(locale), /^1\. /);

    expect(controller).toMatch(NO_DPO_PHRASE[locale]);
    expect(controller).toMatch(/Art\. 37|art\. 37/);
    expect(controller).toMatch(/§ 38 (de la )?BDSG/);
  });

  it("names the competent supervisory authority with its address and website", async () => {
    const doc = await renderPrivacy(locale);
    const rights = sectionText(doc, /^8\. /);

    expect(rights).toContain(
      "Landesbeauftragte für den Datenschutz und die Informationsfreiheit Baden-Württemberg",
    );
    expect(rights).toContain("Heilbronner Straße 35, 70191 Stuttgart");
    expect(
      sectionNumbered(doc, 8)?.querySelector(
        'a[href="https://www.baden-wuerttemberg.datenschutz.de"]',
      ),
    ).not.toBeNull();
    expect(rights).toMatch(/Art\. 77|art\. 77/);
  });

  it("renders the right to object as its own highlighted section right after the rights", async () => {
    const doc = await renderPrivacy(locale);
    const heading = doc.getElementById("right-to-object");
    const section = heading?.closest("section");

    expect(heading?.textContent).toMatch(/^9\. .*21/);
    expect(section?.getAttribute("aria-labelledby")).toBe("right-to-object");
    expect(section?.querySelector(".vk-callout")).not.toBeNull();
    expect(section?.querySelector("strong")).not.toBeNull();
    expect(section?.querySelector('a[href="mailto:info@kreitz-webdev.de"]')).not.toBeNull();
    expect(section?.previousElementSibling?.querySelector("h2")?.textContent).toMatch(/^8\. /);
  });

  it("keeps the section numbers the right to object refers to pointing at the right sections", async () => {
    const doc = await renderPrivacy(locale);
    const objection = sectionText(doc, /^9\. /);
    const byNumber = (n: number) => sectionNumbered(doc, n);

    expect(objection).toMatch(/3, 4,? (and|und|y|et) 12/);
    for (const n of [3, 4, 12]) {
      expect(byNumber(n)?.textContent).toMatch(
        /6(\(1\)\(f\)| Abs\. 1 lit\. f|\.1\.f\)|, § 1, point f\))/,
      );
    }
    expect(
      byNumber(12)?.querySelector(`a[href="${expectedHref(locale, "/contact")}"]`),
    ).not.toBeNull();
    expect(sectionText(doc, /^8\. /)).toMatch(OBJECTION_CROSS_REFERENCE[locale]);
  });

  it("names Contabo as the hosting processor with its legal entity and address", async () => {
    const doc = await renderPrivacy(locale);
    const hosting = sectionText(doc, /^3\. /);

    expect(hosting).toMatch(HOSTING_PROCESSOR[locale]);
    expect(
      sectionNumbered(doc, 3)?.querySelector('a[href^="https://contabo.com/"]'),
    ).not.toBeNull();
  });

  it("states a size-bounded container log and when the access logs are deleted", async () => {
    const hosting = sectionText(await renderPrivacy(locale), /^3\. /);

    expect(hosting).toMatch(CONTAINER_LOG_ROTATION[locale]);
    expect(hosting).toMatch(ACCESS_LOG_DELETION[locale]);
  });

  it("describes what Umami reads and processes", async () => {
    const analytics = sectionText(await renderPrivacy(locale), /^4\. /);

    expect(analytics).toMatch(UMAMI_DEVICE_READS[locale]);
    expect(analytics).toMatch(UMAMI_PSEUDONYMOUS[locale]);
    expect(analytics).toMatch(UMAMI_NOT_STORED[locale]);
    expect(analytics).toMatch(UMAMI_SAME_SERVER[locale]);
    expect(analytics).toMatch(/Do[ -]Not[ -]Track/);
  });

  it("names the data each tracked event carries", async () => {
    const analytics = sectionText(await renderPrivacy(locale), /^4\. /);

    for (const payload of UMAMI_EVENT_PAYLOADS[locale]) {
      expect(analytics).toMatch(payload);
    }
    expect(analytics).not.toMatch(/install command or prompt|Installationsbefehls oder Prompts/);
  });

  it("documents the umami.disabled opt-out and renders the control in the analytics section", async () => {
    const doc = await renderPrivacy(locale);
    const analytics = sectionNumbered(doc, 4);

    expect(analytics?.textContent).toContain("umami.disabled");
    expect(analytics?.querySelector("button")).not.toBeNull();
    expect(analytics?.querySelector("button")?.getAttribute("aria-describedby")).toBeTruthy();
    expect(analytics?.querySelector('[aria-live="polite"]')?.textContent).toBe("");
    expect(doc.querySelectorAll("button")).toHaveLength(1);
  });

  it("states Arcjet's documented 30-day retention and links to its privacy documentation", async () => {
    const doc = await renderPrivacy(locale);
    const contactForm = sectionText(doc, /^12\. /);

    expect(contactForm).toMatch(ARCJET_RETENTION[locale]);
    expect(
      sectionNumbered(doc, 12)?.querySelector('a[href="https://docs.arcjet.com/privacy"]'),
    ).not.toBeNull();
  });

  it("names Arcjet as the only processor besides the hosting provider", async () => {
    const contactForm = sectionText(await renderPrivacy(locale), /^12\. /);

    expect(contactForm).toMatch(ARCJET_ONLY_OTHER_PROCESSOR[locale]);
  });

  it("discloses the transfer to the United States and the safeguard it relies on", async () => {
    const doc = await renderPrivacy(locale);
    const contactForm = sectionText(doc, /^12\. /);

    expect(contactForm).toContain("Arcjet Labs, Inc., San Francisco");
    expect(contactForm).toMatch(ARCJET_THIRD_COUNTRY[locale]);
    expect(contactForm).toMatch(ARCJET_SAFEGUARD[locale]);
    expect(
      sectionNumbered(doc, 12)?.querySelector('a[href="mailto:info@kreitz-webdev.de"]'),
    ).not.toBeNull();
  });
  it("describes the actual translation process and its best-effort review", async () => {
    const doc = await renderPrivacy(locale);
    const aiTranslation = sectionText(doc, /^13\. /);

    expect(aiTranslation).toMatch(AI_TRANSLATION_PIPELINE[locale]);
    expect(aiTranslation).toMatch(AI_TRANSLATION_BEST_EFFORT[locale]);
    expect(
      sectionNumbered(doc, 13)?.querySelector(`a[href="${expectedHref(locale, "/contact")}"]`),
    ).not.toBeNull();
  });
});
