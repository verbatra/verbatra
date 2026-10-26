import { LICENSE_URL } from "@/components/landing/links";
import { type Locale, localizedPath } from "./i18n";

export type ImprintRun =
  | string
  | { readonly text: string; readonly href: string; readonly external?: boolean };

export const IMPRINT_TITLE = "Impressum";

export const IMPRINT_PROVIDER_HEADING = "Angaben zum Anbieter";

export const IMPRINT_PROVIDER_LINES = [
  "Mario Kreitz",
  "Mönchfeldstraße 7",
  "70378 Stuttgart",
  "Deutschland",
] as const;

export const IMPRINT_BASIS_LINE = "Anbieterkennzeichnung nach § 18 Abs. 1 MStV";

export const IMPRINT_EMAIL = "info@kreitz-webdev.de";

export const IMPRINT_EMAIL_LABEL = "E-Mail";

export const IMPRINT_LICENSE_HEADING = "Lizenz";

export function imprintLicenseRuns(locale: Locale): ReadonlyArray<ImprintRun> {
  return [
    "verbatra (Quellcode, Dokumentation und Screenshots) steht unter der ",
    { text: "MIT-Lizenz", href: LICENSE_URL, external: true },
    ". Schriftarten, Icons und Bibliotheken Dritter behalten ihre eigenen Lizenzen; die ",
    { text: "Lizenzhinweise", href: localizedPath(locale, "/licenses") },
    " nennen sie mit vollem Lizenztext.",
  ];
}
