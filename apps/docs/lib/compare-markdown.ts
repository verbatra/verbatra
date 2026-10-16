import { getTranslations } from "next-intl/server";
import { formatLandingDate } from "@/components/landing/hero-facts";
import { badgedProviderNames, compareCellText } from "./compare-cells";
import { type Locale, localizedPath } from "./i18n";
import {
  COMPARE_LAST_CHECKED,
  COMPARE_ROWS,
  COMPARE_TOOL_NAMES,
  COMPARE_TOOLS,
  CONCESSION_FOOTNOTES,
  type CompareFootnote,
  cellFootnote,
  compareSource,
  compareSourceHref,
  fullTableFootnotes,
} from "./landing-compare";
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

async function providerText(locale: Locale): Promise<string> {
  const names = await badgedProviderNames(locale);
  return names
    .map((provider) =>
      provider.badge ? `${provider.label} (${provider.badge.label})` : provider.label,
    )
    .join(", ");
}

export async function compareMarkdown(locale: Locale): Promise<string> {
  const t = await getTranslations({ locale, namespace: "landing.compare" });
  const page = await getTranslations({ locale, namespace: "compare" });
  const providers = await providerText(locale);
  const checked = formatLandingDate(COMPARE_LAST_CHECKED, locale);
  const columns = COMPARE_TOOLS.map((tool) =>
    tool === "manual" ? t("columns.manual") : COMPARE_TOOL_NAMES[tool],
  );
  const header = `| ${[t("columns.criterion"), ...columns].map(tableCell).join(" | ")} |`;
  const divider = `| ${["", ...columns].map(() => "---").join(" | ")} |`;
  const rows = COMPARE_ROWS.map((row) => {
    const cells = COMPARE_TOOLS.map(
      (tool) =>
        `${compareCellText(t, row, tool, { providers })} ${refs([cellFootnote(row, tool)])}`,
    );
    return `| ${[t(`rows.${row}.label`), ...cells].map(tableCell).join(" | ")} |`;
  });
  const sources = fullTableFootnotes().map((footnote) => {
    const source = compareSource(footnote);
    const links = source.urls.map((link) => absolute(compareSourceHref(link, locale)));
    return `${footnote}. ${COMPARE_TOOL_NAMES[source.tool]}: ${links.join("; ")}`;
  });

  return [
    pageFrontmatter({ title: page("meta.title"), description: page("meta.description") }).trimEnd(),
    `# ${page("heading")}`,
    page("lead"),
    page("caption"),
    [header, divider, ...rows].join("\n"),
    `${t("lastChecked")}: ${checked}`,
    t("fairness"),
    page("lingoNote"),
    page("formatsNote"),
    `${page("concession")} ${refs(CONCESSION_FOOTNOTES)}`,
    `## ${page("nextHeading")}`,
    [
      `- [${page("quickstart")}](${absolute(localizedPath(locale, "/docs/quickstart"))})`,
      `- [${page("home")}](${absolute(homePath(locale))})`,
    ].join("\n"),
    `## ${t("sources")}`,
    page("sourcesChecked", { date: checked }),
    sources.join("\n"),
    `M. ${t("manualNote")}`,
  ].join("\n\n");
}
