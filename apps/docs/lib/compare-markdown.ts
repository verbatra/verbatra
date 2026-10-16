import { getTranslations } from "next-intl/server";
import { availableFromCopy } from "@/components/available-from";
import { formatLandingDate } from "@/components/landing/hero-facts";
import { compareCellText, compareProviderNames } from "./compare-cells";
import { type Locale, localizedPath } from "./i18n";
import {
  COMPARE_LAST_CHECKED,
  COMPARE_ROWS,
  COMPARE_TOOL_NAMES,
  COMPARE_TOOLS,
  type CompareFootnote,
  cellFootnote,
  compareSource,
  compareSourceHref,
  FULL_CONCESSION_FOOTNOTES,
  fullTableFootnotes,
} from "./landing-compare";
import { pageFrontmatter } from "./page-frontmatter";
import { homePath, SITE_URL } from "./site";

function absolute(href: string): string {
  return new URL(href, SITE_URL).href;
}

function tableCell(text: string): string {
  return text.replaceAll("|", "\\|");
}

function refs(footnotes: ReadonlyArray<CompareFootnote>): string {
  return footnotes.map((footnote) => `[${footnote}]`).join(" ");
}

async function providerText(locale: Locale): Promise<string> {
  const names = await Promise.all(
    compareProviderNames().map(async (provider) =>
      provider.since
        ? `${provider.label} (${(await availableFromCopy(provider.since, undefined, locale)).label})`
        : provider.label,
    ),
  );
  return names.join(", ");
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
      (tool) => `${compareCellText(t, row, tool, providers)} ${refs([cellFootnote(row, tool)])}`,
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
    `${page("concession")} ${refs(FULL_CONCESSION_FOOTNOTES)}`,
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
