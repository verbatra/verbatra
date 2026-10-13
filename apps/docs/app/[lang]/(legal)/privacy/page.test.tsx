// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createTranslator } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { i18n, type Locale } from "@/lib/i18n";
import { PACKAGE_MANAGER_GROUP } from "@/lib/package-manager-tabs";
import { ANALYTICS_OPT_OUT_COOKIE } from "@/lib/server-pageview";
import { THEME_STORAGE_KEY } from "@/lib/theme";

const HERE = dirname(fileURLToPath(import.meta.url));
const MESSAGES_DIR = join(HERE, "../../../../messages");
const IMPRINT_PAGE = join(HERE, "../imprint/page.tsx");

function loadMessages(locale: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(MESSAGES_DIR, `${locale}.json`), "utf8"));
}

vi.mock("next-intl/server", () => ({
  setRequestLocale: () => undefined,
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

const IMPRINT_NAME_IN_TEXT: Record<Locale, string> = {
  en: "legal notice (Impressum)",
  de: "Impressum",
  es: "aviso legal (Impressum)",
  fr: "mentions légales (Impressum)",
};

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

const UMAMI_SERVER_FORWARD: Record<Locale, RegExp> = {
  en: /No analytics script runs in your browser, and nothing is written to your device for counting page views\..*our web server forwards .*: your IP address, your browser's user-agent string, your browser language, the referring page \(without its query string\) and the path of the page you loaded/,
  de: /In deinem Browser läuft kein Analyseskript, und zum Zählen der Seitenaufrufe wird nichts auf deinem Gerät gespeichert\..*leitet unser Webserver.*deine IP-Adresse, die User-Agent-Zeichenkette deines Browsers, deine Browsersprache, die verweisende Seite \(ohne ihre Query-Parameter\) und den Pfad der geladenen Seite/,
  es: /En tu navegador no se ejecuta ningún script de analítica, y para contar las visitas no se escribe nada en tu dispositivo\..*nuestro servidor web reenvía .*: tu dirección IP, la cadena de user-agent de tu navegador, el idioma de tu navegador, la página de referencia \(sin sus parámetros de consulta\) y la ruta de la página que cargaste/,
  fr: /Aucun script de statistiques ne s'exécute dans ton navigateur, et rien n'est écrit sur ton appareil pour compter les pages vues\..*notre serveur web transmet .*: ton adresse IP, la chaîne user-agent de ton navigateur, la langue de ton navigateur, la page référente \(sans ses paramètres de requête\) et le chemin de la page chargée/,
};

const UMAMI_SESSION_HASH: Record<Locale, RegExp> = {
  en: /hashing the website ID, your IP address, your user-agent string, a value that changes every month and a secret key of the server/,
  de: /indem er die Website-ID, deine IP-Adresse, deine User-Agent-Zeichenkette, einen monatlich wechselnden Wert und einen geheimen Schlüssel des Servers hasht/,
  es: /aplicando un hash al ID del sitio web, tu dirección IP, tu cadena de user-agent, un valor que cambia cada mes y una clave secreta del servidor/,
  fr: /en hachant l'identifiant du site, ton adresse IP, ta chaîne user-agent, une valeur qui change chaque mois et une clé secrète du serveur/,
};

const UMAMI_GEOLITE: Record<Locale, RegExp> = {
  en: /country, region and city, which it looks up from your IP address in a GeoLite2 database on the same server/,
  de: /Land, Region und Stadt, die er aus deiner IP-Adresse in einer GeoLite2-Datenbank auf demselben Server ermittelt/,
  es: /país, región y ciudad, que obtiene a partir de tu dirección IP en una base de datos GeoLite2 del mismo servidor/,
  fr: /ton pays, ta région et ta ville, qu'il détermine à partir de ton adresse IP dans une base de données GeoLite2 sur le même serveur/,
};

const UMAMI_LEGAL_BASIS: Record<Locale, RegExp> = {
  en: /no consent under § 25 TDDDG .* is required for it\. The legal basis for the processing is Art\. 6\(1\)\(f\) GDPR/,
  de: /keine Einwilligung nach § 25 TDDDG .* erforderlich\. Rechtsgrundlage der Verarbeitung ist Art\. 6 Abs\. 1 lit\. f DSGVO/,
  es: /no se necesita ningún consentimiento según el § 25 de la TDDDG .* La base jurídica del tratamiento es el art\. 6\.1\.f\) del RGPD/,
  fr: /aucun consentement au titre du § 25 TDDDG .* n'est nécessaire\. La base légale du traitement est l'art\. 6, § 1, point f\) du RGPD/,
};

const UMAMI_NO_INTERACTIONS: Record<Locale, RegExp> = {
  en: /Clicks, copied text and other interactions are not recorded\./,
  de: /Klicks, kopierte Texte und andere Interaktionen werden nicht erfasst\./,
  es: /No se registran clics, textos copiados ni otras interacciones\./,
  fr: /Les clics, les textes copiés et les autres interactions ne sont pas enregistrés\./,
};

const UMAMI_OLD_OPT_OUT_IGNORED: Record<Locale, RegExp> = {
  en: /opt-out saved in your browser's local storage under this site's earlier analytics setup is no longer read/,
  de: /Widerspruch, der unter der früheren Analyse-Einrichtung dieser Seite im lokalen Speicher deines Browsers abgelegt wurde, wird nicht mehr ausgelesen/,
  es: /exclusión guardada en el almacenamiento local de tu navegador con la configuración de analítica anterior de este sitio ya no se lee/,
  fr: /opposition enregistrée dans le stockage local de ton navigateur avec l'ancienne configuration statistique de ce site n'est plus lue/,
};

const OPT_OUT_COOKIE_BASIS: Record<Locale, RegExp> = {
  en: /verbatra_analytics_optout with the value 1, valid for one year.*needs no consent \(§ 25\(2\) no\. 2 TDDDG\)\. Allowing analytics again deletes it\. No other cookies are set\./,
  de: /verbatra_analytics_optout mit dem Wert 1, gültig für ein Jahr.*keine Einwilligung braucht \(§ 25 Abs\. 2 Nr\. 2 TDDDG\)\. Wenn du die Analyse wieder erlaubst, wird es gelöscht\. Andere Cookies werden nicht gesetzt\./,
  es: /verbatra_analytics_optout con el valor 1, válida durante un año.*no requiere consentimiento \(§ 25, apdo\. 2, n\.º 2 de la TDDDG\)\. Si vuelves a permitir la analítica, se elimina\. No se establece ninguna otra cookie\./,
  fr: /verbatra_analytics_optout avec la valeur 1, valable un an.*ne requiert donc aucun consentement \(§ 25, al\. 2, n° 2 TDDDG\)\. Autoriser à nouveau les statistiques le supprime\. Aucun autre cookie n'est déposé\./,
};

const OPT_OUT_COOKIE_READ_ONLY_TO_HONOUR: Record<Locale, RegExp> = {
  en: /The only thing read from your device in connection with analytics is the opt-out cookie described in section 5, and only to honour your objection\..*Because nothing is stored on your device for counting page views and the opt-out cookie is read only to honour your objection, no consent/,
  de: /Im Zusammenhang mit der Analyse wird von deinem Gerät nur das in Abschnitt 5 beschriebene Widerspruchs-Cookie ausgelesen, und zwar ausschließlich, um deinen Widerspruch zu beachten\..*Weil zum Zählen der Seitenaufrufe nichts auf deinem Gerät gespeichert wird und das Widerspruchs-Cookie nur ausgelesen wird, um deinen Widerspruch zu beachten, ist dafür keine Einwilligung/,
  es: /Lo único que se lee de tu dispositivo en relación con la analítica es la cookie de oposición descrita en la sección 5, y solo para respetar tu oposición\..*Como para contar las visitas no se almacena nada en tu dispositivo y la cookie de oposición solo se lee para respetar tu oposición, no se necesita ningún consentimiento/,
  fr: /La seule chose lue sur ton appareil en lien avec les statistiques est le cookie d'opposition décrit à la section 5, et uniquement pour respecter ton opposition\..*Comme rien n'est stocké sur ton appareil pour compter les pages vues et que le cookie d'opposition n'est lu que pour respecter ton opposition, aucun consentement/,
};

const THEME_STORAGE: Record<Locale, RegExp> = {
  en: /light and dark theme, your choice is saved in local storage under the key theme\./,
  de: /hellem und dunklem Design wechselst, wird deine Wahl im lokalen Speicher \(Local Storage\) unter dem Schlüssel theme abgelegt\./,
  es: /tema claro y el oscuro, tu elección se guarda en el almacenamiento local con la clave theme\./,
  fr: /thème clair au thème sombre ou inversement, ton choix est enregistré dans le stockage local sous la clé theme\./,
};

const PACKAGE_MANAGER_STORAGE: Record<Locale, RegExp> = {
  en: /package manager \(npm, pnpm, yarn or bun\) on the tabs above an install command, your choice is saved under the key package-manager in both local storage and session storage/,
  de: /Paketmanager \(npm, pnpm, yarn oder bun\) auswählst, wird deine Wahl unter dem Schlüssel package-manager sowohl im lokalen Speicher als auch im Sitzungsspeicher \(Session Storage\) abgelegt/,
  es: /gestor de paquetes \(npm, pnpm, yarn o bun\) en las pestañas encima de un comando de instalación, tu elección se guarda con la clave package-manager tanto en el almacenamiento local como en el almacenamiento de sesión/,
  fr: /gestionnaire de paquets \(npm, pnpm, yarn ou bun\) dans les onglets au-dessus d'une commande d'installation, ton choix est enregistré sous la clé package-manager, à la fois dans le stockage local et dans le stockage de session/,
};

const STORAGE_NEVER_SENT: Record<Locale, RegExp> = {
  en: /Neither entry is written before you make that choice; both stay in your browser, are never sent to our server or anyone else/,
  de: /Keiner der beiden Einträge wird geschrieben, bevor du diese Wahl triffst; beide bleiben in deinem Browser, werden nie an unseren Server oder an andere gesendet/,
  es: /Ninguna de las dos entradas se escribe antes de que hagas esa elección; ambas se quedan en tu navegador, nunca se envían a nuestro servidor ni a nadie más/,
  fr: /Aucune de ces deux entrées n'est écrite avant que tu fasses ce choix ; toutes deux restent dans ton navigateur, ne sont jamais envoyées à notre serveur ni à qui que ce soit/,
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
      sectionNumbered(doc, 1)?.querySelector(`a[href="${expectedHref(locale, "/imprint")}"]`)
        ?.textContent,
    ).toBe(IMPRINT_NAME_IN_TEXT[locale]);
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

  it("describes the server-side pageview and what Umami derives and keeps", async () => {
    const analytics = sectionText(await renderPrivacy(locale), /^4\. /);

    expect(analytics).toMatch(UMAMI_SERVER_FORWARD[locale]);
    expect(analytics).toMatch(UMAMI_PSEUDONYMOUS[locale]);
    expect(analytics).toMatch(UMAMI_SESSION_HASH[locale]);
    expect(analytics).toMatch(UMAMI_GEOLITE[locale]);
    expect(analytics).toMatch(UMAMI_NOT_STORED[locale]);
    expect(analytics).toMatch(UMAMI_SAME_SERVER[locale]);
    expect(analytics).toMatch(UMAMI_LEGAL_BASIS[locale]);
    expect(analytics).toMatch(
      /Global Privacy Control \(GPC\)|Global-Privacy-Control-Signal \(GPC\)/,
    );
    expect(analytics).toMatch(/Do[ -]Not[ -]Track/);
  });

  it("records no interactions and no longer reads the old local storage opt-out", async () => {
    const analytics = sectionText(await renderPrivacy(locale), /^4\. /);

    expect(analytics).toMatch(UMAMI_NO_INTERACTIONS[locale]);
    expect(analytics).toMatch(UMAMI_OLD_OPT_OUT_IGNORED[locale]);
    expect(analytics).not.toContain("umami.disabled");
  });

  it("renders the opt-out as two plain forms in the analytics section", async () => {
    const doc = await renderPrivacy(locale);
    const analytics = sectionNumbered(doc, 4);
    const forms = Array.from(analytics?.querySelectorAll("form") ?? []);

    expect(analytics?.querySelector("h2")?.id).toBe("analytics");
    expect(forms).toHaveLength(2);
    for (const form of forms) {
      expect(form.getAttribute("method")).toBe("post");
      expect(form.getAttribute("action")).toBe("/api/analytics");
      expect(form.querySelector<HTMLInputElement>('input[name="lang"]')?.value).toBe(locale);
    }
    expect(analytics?.querySelector("#analytics-off")).not.toBeNull();
    expect(analytics?.querySelector("#analytics-on")).not.toBeNull();
    expect(doc.querySelectorAll("form")).toHaveLength(2);
  });

  it("names the opt-out cookie as the only cookie and every browser storage entry", async () => {
    const cookies = sectionText(await renderPrivacy(locale), /^5\. /);

    expect(cookies).toMatch(OPT_OUT_COOKIE_BASIS[locale]);
    expect(cookies).toMatch(THEME_STORAGE[locale]);
    expect(cookies).toMatch(PACKAGE_MANAGER_STORAGE[locale]);
    expect(cookies).toMatch(STORAGE_NEVER_SENT[locale]);
  });

  it("names the cookie and the storage keys under the names the site code writes", async () => {
    const cookies = sectionText(await renderPrivacy(locale), /^5\. /);

    for (const name of [ANALYTICS_OPT_OUT_COOKIE, THEME_STORAGE_KEY, PACKAGE_MANAGER_GROUP]) {
      expect(cookies).toMatch(new RegExp(`(^|\\s)${name}[\\s.,]`));
    }
  });

  it("states that the opt-out cookie is read only to honour the objection", async () => {
    const analytics = sectionText(await renderPrivacy(locale), /^4\. /);

    expect(analytics).toMatch(OPT_OUT_COOKIE_READ_ONLY_TO_HONOUR[locale]);
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
