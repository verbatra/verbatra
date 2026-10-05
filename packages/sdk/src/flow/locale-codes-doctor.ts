import { nonCanonicalLocales } from "../config/locale-code.js";
import { type DoctorFinding, passFinding, warnFinding } from "./doctor-finding.js";

export function describeLocaleCodes(locales: readonly string[]): DoctorFinding {
  const found = nonCanonicalLocales(locales);
  if (found.length === 0) {
    return passFinding("Every configured locale code is in canonical BCP 47 form.");
  }
  const suggestions = found
    .map(({ locale, canonical }) => `"${locale}" is canonically "${canonical}"`)
    .join(", ");
  return warnFinding(
    `${suggestions}. Consider the canonical form in your config; file names follow the ` +
      "configured code and are never renamed for you.",
  );
}
