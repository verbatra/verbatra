import { getTranslations } from "next-intl/server";
import { type CellTranslator, compareCellView } from "./compare-cells";
import { type Locale, localizedPath } from "./i18n";
import {
  COMPARE_LAST_CHECKED,
  COMPARE_ROWS,
  COMPARE_TOOL_NAMES,
  COMPARE_TOOLS,
  CONCESSION_FOOTNOTES,
  type CompareFootnote,
  type CompareRowId,
  type CompareTool,
  cellFootnote,
  compareCell,
  compareSource,
  compareSourceHref,
  fullTableFootnotes,
} from "./landing-compare";
import { formatLandingDate } from "./landing-date";
import { MACHINE_PROVIDER_IDS } from "./landing-facts";
import { providerShortLabel } from "./landing-providers";
import { absoluteMarkdownHref } from "./markdown-links";
import { pageFrontmatter } from "./page-frontmatter";
import { homePath } from "./site";

function absolute(href: string): string {
  return href.startsWith("/") ? absoluteMarkdownHref(href) : href;
}

function tableCell(text: string): string {
  return text.replaceAll("|", "\\|");
}

function refs(footnotes: ReadonlyArray<CompareFootnote>): string {
  return footnotes.map((footnote) => `[${footnote}]`).join(" ");
}

function providerNames(): string {
  return MACHINE_PROVIDER_IDS.map(providerShortLabel).join(", ");
}

function cellText(t: CellTranslator, row: CompareRowId, tool: CompareTool): string {
  const { word, note } = compareCellView(t, row, tool);
  const detail = row === "providers" && tool === "verbatra" ? providerNames() : note;
  if (detail === null) return word;
  const cell = compareCell(row, tool);
  const separator = cell.kind === "verdict" && cell.verdict === "noneFound" ? " " : " - ";
  return `${word}${separator}${detail}`;
}

export async function compareMarkdown(locale: Locale): Promise<string> {
  const t = await getTranslations({ locale, namespace: "landing.compare" });
  const page = await getTranslations({ locale, namespace: "compare" });
  const checked = formatLandingDate(COMPARE_LAST_CHECKED, locale);
  const columns = COMPARE_TOOLS.map((tool) =>
    tool === "manual" ? t("columns.manual") : COMPARE_TOOL_NAMES[tool],
  );
  const header = `| ${[t("columns.criterion"), ...columns].map(tableCell).join(" | ")} |`;
  const divider = `| ${["", ...columns].map(() => "---").join(" | ")} |`;
  const rows = COMPARE_ROWS.map((row) => {
    const line = COMPARE_TOOLS.map(
      (tool) => `${cellText(t, row, tool)} ${refs([cellFootnote(row, tool)])}`,
    );
    return `| ${[t(`rows.${row}.label`), ...line].map(tableCell).join(" | ")} |`;
  });
  const sources = fullTableFootnotes().map((footnote) => {
    const source = compareSource(footnote);
    const links = source.urls.map((link) => absolute(compareSourceHref(link, locale)));
    return `${footnote}. ${COMPARE_TOOL_NAMES[source.tool]}: ${links.join("; ")}`;
  });

  return [
    pageFrontmatter({ title: page("meta.title"), description: page("meta.description") }).trimEnd(),
    `# ${page("heading")}`,
    page("takeaway"),
    page("scope"),
    page("caption"),
    [header, divider, ...rows].join("\n"),
    `${t("lastChecked")}: ${checked}`,
    t("fairness"),
    page("lingoNote"),
    page("formatsNote"),
    `${page("stronger")} ${refs(CONCESSION_FOOTNOTES)}`,
    `## ${page("nextHeading")}`,
    [
      `- [${page("quickstart")}](${absolute(localizedPath(locale, "/docs/quickstart"))})`,
      `- [${page("home")}](${absolute(homePath(locale))})`,
    ].join("\n"),
    `## ${t("sources")}`,
    sources.join("\n"),
    `M. ${t("manualNote")}`,
  ].join("\n\n");
}
