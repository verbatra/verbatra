import { getTranslations } from "next-intl/server";
import { availableFromCopy } from "@/components/available-from";
import { LICENSE_URL, releaseUrl } from "@/components/landing/links";
import {
  HERO_CHECK_EXIT_CODE,
  HERO_SENT_STRINGS,
  HERO_TERMINAL_NEW_KEYS,
  HERO_TERMINAL_SYNCED_KEYS,
  HERO_TOTAL_STRINGS,
  HERO_TRANSLATE_COMMAND,
  HERO_TRANSLATE_LOCALE_LINES,
  HERO_TRANSLATE_OUTPUT,
} from "./hero-terminal";
import { type Locale, localizedPath } from "./i18n";
import { DRY_RUN_COMMAND, HERO_INSTALL_COMMAND, MCP_ADD_COMMAND } from "./install-commands";
import { FORMAT_DISPLAY, SUPPORTED_FORMAT_IDS } from "./landing-facts";
import { FAQ_ANSWER_LINKS, FAQ_ASIDE_LINKS, FAQ_ITEM_IDS, faqHref, faqValues } from "./landing-faq";
import { LANDING_FEATURES } from "./landing-features";
import {
  PLAYGROUND_DEFAULT_ITEM,
  PLAYGROUND_DOCS_LINKS,
  PLAYGROUND_ITEMS,
  PLAYGROUND_LANGUAGES,
  PLAYGROUND_METADATA,
  PLAYGROUND_SNIPPET,
  PLAYGROUND_SNIPPET_FILE,
  PLAYGROUND_TRANSLATIONS,
  playgroundGeneratedOn,
} from "./landing-playground";
import { landingProviders, PROVIDER_DISPLAY } from "./landing-providers";
import { LANDING_SECTIONS, type LandingSectionId } from "./landing-sections";
import { fencedMarkdown, inlineCodeMarkdown, markupChunks } from "./llm-markdown";
import { absoluteMarkdownHref } from "./markdown-links";
import { pageFrontmatter } from "./page-frontmatter";
import { RELEASE_BADGE } from "./release-badge";
import { PACKAGE_VERSION } from "./site";

type Context = { readonly locale: Locale; readonly badge: string };

function href(path: string): string {
  return path.startsWith("/") ? absoluteMarkdownHref(path) : path;
}

function link(text: string, target: string): string {
  return `[${text}](${href(target)})`;
}

function list(items: ReadonlyArray<string>): string {
  return items.map((item) => `- ${item}`).join("\n");
}

function tableCell(text: string): string {
  return text.replaceAll("|", "\\|").replaceAll("\n", " ");
}

function table(header: ReadonlyArray<string>, rows: ReadonlyArray<ReadonlyArray<string>>): string {
  const line = (cells: ReadonlyArray<string>) => `| ${cells.map(tableCell).join(" | ")} |`;
  return [line(header), line(header.map(() => "---")), ...rows.map(line)].join("\n");
}

function blocks(...parts: ReadonlyArray<string | null>): string {
  return parts.filter((part): part is string => part !== null && part !== "").join("\n\n");
}

const MARKDOWN_TAGS = {
  code: (chunks: string) => inlineCodeMarkdown(markupChunks(chunks)),
};

async function hero({ locale }: Context): Promise<string> {
  const t = await getTranslations({ locale, namespace: "landing.banner" });
  const quickstart = localizedPath(locale, "/docs/quickstart");
  return blocks(
    `# ${t.markup("headline", { accent: (chunks: string) => markupChunks(chunks) })}`,
    link(
      `${t("announcement.badge")}: ${t("announcement.text", { version: PACKAGE_VERSION })}`,
      releaseUrl(PACKAGE_VERSION),
    ),
    t("lead"),
    list([link(t("ctaPrimary"), quickstart)]),
    fencedMarkdown("sh", null, HERO_INSTALL_COMMAND),
  );
}

function withBadge(label: string, isNew: boolean, badge: string): string {
  return isNew ? `${label} (${badge})` : label;
}

async function marquee({ locale, badge }: Context): Promise<string> {
  const t = await getTranslations({ locale, namespace: "landing.marquee" });
  return blocks(
    `## ${t("heading")}`,
    `### ${t("formats")}`,
    list(SUPPORTED_FORMAT_IDS.map((id) => FORMAT_DISPLAY[id].label)),
    link(t("allFormats"), localizedPath(locale, "/docs/formats")),
    `### ${t("providers")}`,
    list(
      landingProviders().map((provider) =>
        withBadge(provider.label, provider.isNew, `${t("new")}, ${badge}`),
      ),
    ),
    link(t("allProviders"), localizedPath(locale, "/docs/providers")),
  );
}

async function playground({ locale }: Context): Promise<string> {
  const t = await getTranslations({ locale, namespace: "landing.playground" });
  const generated = playgroundGeneratedOn(locale).text;
  return blocks(
    `## ${t("heading")}`,
    t("lead"),
    t("label"),
    list([
      `${t("metadata.provider")}: ${PROVIDER_DISPLAY[PLAYGROUND_METADATA.provider].label}`,
      `${t("metadata.model")}: ${inlineCodeMarkdown(PLAYGROUND_METADATA.model)}`,
      `${t("metadata.generated")}: ${generated}`,
    ]),
    `${t("table.caption")}:`,
    table(
      [t("table.source"), ...PLAYGROUND_LANGUAGES.map((code) => t(`languageNames.${code}`))],
      PLAYGROUND_ITEMS.map((item) => [
        item.text,
        ...PLAYGROUND_LANGUAGES.map((code) => PLAYGROUND_TRANSLATIONS[code]?.[item.id] ?? ""),
      ]),
    ),
    fencedMarkdown("ts", `title="${PLAYGROUND_SNIPPET_FILE}"`, PLAYGROUND_SNIPPET),
    `${t("links.label")}:`,
    list(
      PLAYGROUND_DOCS_LINKS.map(([key, path]) =>
        link(t(`links.${key}`), localizedPath(locale, path)),
      ),
    ),
  );
}

async function faq({ locale }: Context): Promise<string> {
  const t = await getTranslations({ locale, namespace: "landing.faq" });
  const items = FAQ_ITEM_IDS.map((id) =>
    blocks(
      `### ${t(`items.${id}.question`)}`,
      t.markup(`items.${id}.answer`, {
        ...faqValues(id, locale),
        ...MARKDOWN_TAGS,
        link: (chunks: string) => link(markupChunks(chunks), faqHref(locale, FAQ_ANSWER_LINKS[id])),
        license: (chunks: string) => link(markupChunks(chunks), LICENSE_URL),
      }),
    ),
  );
  return blocks(
    `## ${t("heading")}`,
    t("lead"),
    ...items,
    `${t("docs.label")}:`,
    list(
      FAQ_ASIDE_LINKS.map(({ key, link: target }) =>
        link(t(`docs.${key}`), faqHref(locale, target)),
      ),
    ),
  );
}

async function statement({ locale }: Context): Promise<string> {
  const t = await getTranslations({ locale, namespace: "landing.statement" });
  return blocks(
    `## ${t("label")}`,
    t.markup("heading", {
      sent: HERO_TERMINAL_NEW_KEYS.length,
      kept: HERO_TERMINAL_SYNCED_KEYS.length,
      em: (chunks: string) => markupChunks(chunks),
    }),
    fencedMarkdown("text", null, HERO_TRANSLATE_LOCALE_LINES[0] ?? ""),
  );
}

async function highlights({ locale }: Context): Promise<string> {
  const t = await getTranslations({ locale, namespace: "landing.highlights" });
  return blocks(
    `## ${t("heading")}`,
    t("lead"),
    `### ${t("translate.label")}: ${t("translate.title", { sent: HERO_SENT_STRINGS, total: HERO_TOTAL_STRINGS })}`,
    fencedMarkdown(
      "text",
      null,
      [`$ ${HERO_TRANSLATE_COMMAND}`, ...HERO_TRANSLATE_OUTPUT.slice(1)].join("\n"),
    ),
    `### ${t("ci.label")}: ${t("ci.title")}`,
    inlineCodeMarkdown(`exit ${HERO_CHECK_EXIT_CODE}`),
    t("ci.body", { code: HERO_CHECK_EXIT_CODE }),
    `### ${t("integrity.label")}: ${t("integrity.title")}`,
    list(
      PLAYGROUND_LANGUAGES.map(
        (code) => `${code}: ${PLAYGROUND_TRANSLATIONS[code]?.[PLAYGROUND_DEFAULT_ITEM] ?? ""}`,
      ),
    ),
    `### ${t("agents.label")}: ${t("agents.title")}`,
    t("agents.body"),
    fencedMarkdown("sh", null, MCP_ADD_COMMAND),
  );
}

async function features({ locale }: Context): Promise<string> {
  const t = await getTranslations({ locale, namespace: "landing.features" });
  return blocks(
    `## ${t("label")}: ${t("heading")}`,
    t("lead"),
    list(
      LANDING_FEATURES.map(
        ({ id, docsPath }) =>
          `${link(t(`items.${id}.title`), localizedPath(locale, docsPath))}: ${t(`items.${id}.body`)}`,
      ),
    ),
  );
}

async function finalCta({ locale }: Context): Promise<string> {
  const t = await getTranslations({ locale, namespace: "landing.closing" });
  return blocks(
    `## ${t("heading")}`,
    t("label"),
    t("lead"),
    fencedMarkdown("sh", null, DRY_RUN_COMMAND),
  );
}

const SECTION_MARKDOWN: Readonly<Record<LandingSectionId, (context: Context) => Promise<string>>> =
  {
    hero,
    marquee,
    statement,
    highlights,
    playground,
    features,
    faq,
    finalCta,
  };

export async function landingMarkdown(locale: Locale): Promise<string> {
  const t = await getTranslations({ locale, namespace: "landing.meta" });
  const { label } = await availableFromCopy(RELEASE_BADGE.version, undefined, locale);
  const context: Context = { locale, badge: label };
  const sections = await Promise.all(LANDING_SECTIONS.map((id) => SECTION_MARKDOWN[id](context)));
  return blocks(
    pageFrontmatter({ title: t("title"), description: t("description") }).trimEnd(),
    ...sections,
  );
}
