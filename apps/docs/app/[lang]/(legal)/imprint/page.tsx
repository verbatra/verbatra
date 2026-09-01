import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { toLocale } from "@/lib/i18n";
import { LEGAL_LAST_UPDATED, localeAlternates } from "@/lib/site";

const linkTags = {
  link: (chunks: ReactNode) => <a href="/contact">{chunks}</a>,
};

const ODR = "https://ec.europa.eu/consumers/odr/";

export async function generateMetadata(props: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await props.params;
  const locale = toLocale(lang);
  const t = await getTranslations({ locale, namespace: "legal.imprint.meta" });
  return {
    title: t("title"),
    description: t("description"),
    robots: { index: true },
    alternates: localeAlternates(locale, "/imprint"),
  };
}

export default async function ImprintPage(props: { params: Promise<{ lang: string }> }) {
  const { lang } = await props.params;
  const t = await getTranslations({ locale: lang, namespace: "legal.imprint" });

  return (
    <main className="container mx-auto max-w-3xl px-6 py-16 prose">
      <h1>Impressum</h1>
      <p>{t("intro")}</p>
      <p>
        <em>
          {t("lastUpdatedLabel")}: {LEGAL_LAST_UPDATED}
        </em>
      </p>

      <h2>Angaben gem&auml;&szlig; &sect; 5 DDG</h2>
      <p>
        Mario Kreitz
        <br />
        M&ouml;nchfeldstra&szlig;e 7
        <br />
        70378 Stuttgart
        <br />
        Deutschland
        <br />
        E-Mail: <a href="mailto:info@kreitz-webdev.de">info@kreitz-webdev.de</a>
      </p>
      <p>{t.rich("contactLinkNote", linkTags)}</p>

      <h2>Verantwortlich f&uuml;r den Inhalt nach &sect; 18 Abs. 2 MStV</h2>
      <p>
        Mario Kreitz
        <br />
        M&ouml;nchfeldstra&szlig;e 7
        <br />
        70378 Stuttgart
        <br />
        Deutschland
      </p>

      <h2>Haftung f&uuml;r Inhalte</h2>
      <p>
        Als Diensteanbieter sind wir gem&auml;&szlig; &sect; 7 Abs. 1 DDG f&uuml;r eigene Inhalte
        auf diesen Seiten nach den allgemeinen Gesetzen verantwortlich. Nach &sect;&sect; 8 bis 10
        DDG sind wir als Diensteanbieter jedoch nicht verpflichtet, &uuml;bermittelte oder
        gespeicherte fremde Informationen zu &uuml;berwachen oder nach Umst&auml;nden zu forschen,
        die auf eine rechtswidrige T&auml;tigkeit hinweisen. Verpflichtungen zur Entfernung oder
        Sperrung der Nutzung von Informationen nach den allgemeinen Gesetzen bleiben hiervon
        unber&uuml;hrt. Eine diesbez&uuml;gliche Haftung ist jedoch erst ab dem Zeitpunkt der
        Kenntnis einer konkreten Rechtsverletzung m&ouml;glich. Bei Bekanntwerden von entsprechenden
        Rechtsverletzungen werden wir diese Inhalte umgehend entfernen.
      </p>

      <h2>Haftung f&uuml;r Links</h2>
      <p>
        Unser Angebot enth&auml;lt Links zu externen Websites Dritter, auf deren Inhalte wir keinen
        Einfluss haben. Deshalb k&ouml;nnen wir f&uuml;r diese fremden Inhalte auch keine
        Gew&auml;hr &uuml;bernehmen. F&uuml;r die Inhalte der verlinkten Seiten ist stets der
        jeweilige Anbieter oder Betreiber der Seiten verantwortlich. Die verlinkten Seiten wurden
        zum Zeitpunkt der Verlinkung auf m&ouml;gliche Rechtsverst&ouml;&szlig;e
        &uuml;berpr&uuml;ft. Rechtswidrige Inhalte waren zum Zeitpunkt der Verlinkung nicht
        erkennbar. Eine permanente inhaltliche Kontrolle der verlinkten Seiten ist jedoch ohne
        konkrete Anhaltspunkte einer Rechtsverletzung nicht zumutbar. Bei Bekanntwerden von
        Rechtsverletzungen werden wir derartige Links umgehend entfernen.
      </p>

      <h2>Urheberrecht</h2>
      <p>
        Die durch die Seitenbetreiber erstellten Inhalte und Werke auf diesen Seiten unterliegen dem
        deutschen Urheberrecht. Die Vervielf&auml;ltigung, Bearbeitung, Verbreitung und jede Art der
        Verwertung au&szlig;erhalb der Grenzen des Urheberrechts bed&uuml;rfen der schriftlichen
        Zustimmung des jeweiligen Autors bzw. Erstellers. Soweit die Inhalte auf dieser Seite nicht
        vom Betreiber erstellt wurden, werden die Urheberrechte Dritter beachtet. Der Quellcode
        dieses Projekts ist quelloffen unter der MIT-Lizenz ver&ouml;ffentlicht. Sollten Sie
        trotzdem auf eine Urheberrechtsverletzung aufmerksam werden, bitten wir um einen
        entsprechenden Hinweis. Bei Bekanntwerden von Rechtsverletzungen werden wir derartige
        Inhalte umgehend entfernen.
      </p>

      <h2>EU-Streitschlichtung</h2>
      <p>
        Die Europ&auml;ische Kommission stellt eine Plattform zur Online-Streitbeilegung (OS)
        bereit: <a href={ODR}>https://ec.europa.eu/consumers/odr/</a>. Unsere E-Mail-Adresse finden
        Sie oben im Impressum. Wir sind nicht bereit oder verpflichtet, an Streitbeilegungsverfahren
        vor einer Verbraucherschlichtungsstelle teilzunehmen.
      </p>
    </main>
  );
}
