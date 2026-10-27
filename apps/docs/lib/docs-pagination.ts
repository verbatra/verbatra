import type { Locale } from "./i18n";
import { UI_TRANSLATIONS } from "./ui-translations";

const PREVIOUS = "Previous Page(pagination)";
const NEXT = "Next Page(pagination)";

export function paginationLabels(locale: Locale): { previous: string; next: string } {
  if (locale === "en") return { previous: "Previous Page", next: "Next Page" };
  const labels = UI_TRANSLATIONS[locale];
  return { previous: labels[PREVIOUS], next: labels[NEXT] };
}
