import { getTranslations } from "next-intl/server";
import { availableFromCopy } from "@/components/available-from";
import { formatLandingDate } from "@/components/landing/hero-facts";
import { GITHUB_URL, LICENSE_URL } from "@/components/landing/links";
import { AI_SETUP_PROMPT } from "./ai-setup-prompt";
import { CONTRIBUTORS } from "./contributors";
import { HERO_DIFF_SOURCE_PANE, HERO_DIFF_TARGET_PANE } from "./hero-diff";
import { type Locale, localizedPath } from "./i18n";
import { NPM_INSTALL_COMMAND } from "./install-commands";
import {
  BENTO_KEY_ENV_VARS,
  BENTO_KEYS_LINK,
  BENTO_NONE_LINK,
  BENTO_PROVIDERS_LINK,
  BENTO_QUICKSTART_PAGE,
  BENTO_RUN_SUMMARY_CODE,
  BENTO_SAFETY_LINK,
  BENTO_TILES,
  type BentoKey,
  type BentoTile,
  bentoHref,
  FORMAT_FAMILIES,
  formatsInFamily,
} from "./landing-bento";
import { COMPARE_LAST_CHECKED, COMPARE_PATH, SHORT_COLUMNS, SHORT_ROWS } from "./landing-compare";
import { FORMAT_DISPLAY, MACHINE_PROVIDER_IDS, SUPPORTED_FORMAT_IDS } from "./landing-facts";
import { FAQ_ANSWER_LINKS, FAQ_ASIDE_LINKS, FAQ_ITEM_IDS, faqHref, faqValues } from "./landing-faq";
import { FLOW_BODY_VALUES, FLOW_DEMO_NODE, FLOW_NODES } from "./landing-flow";
import { CONTRIBUTION_STEPS, OPEN_SOURCE_LINKS } from "./landing-open-source";
import {
  PLAYGROUND_DOCS_LINKS,
  PLAYGROUND_ITEMS,
  PLAYGROUND_LANGUAGES,
  PLAYGROUND_METADATA,
  PLAYGROUND_SNIPPET,
  PLAYGROUND_SNIPPET_FILE,
  PLAYGROUND_TRANSLATIONS,
  playgroundGeneratedOn,
} from "./landing-playground";
import {
  landingProviders,
  PROVIDER_DISPLAY,
  PROVIDER_KINDS,
  providersOfKind,
} from "./landing-providers";
import { LANDING_SECTIONS, type LandingSectionId } from "./landing-sections";
import { fencedMarkdown, inlineCodeMarkdown, markupChunks } from "./llm-markdown";
import { absoluteMarkdownHref } from "./markdown-links";
import { nodeVersionsLabel } from "./node-requirement";
import { pageFrontmatter } from "./page-frontmatter";
import { featureReleaseBadge, providerReleaseBadge, RELEASE_BADGE } from "./release-badge";
import {
  LANDING_LAST_UPDATED,
  MCP_VERSION,
  NODE_RANGE,
  PACKAGE_VERSION,
  STUDIO_VERSION,
} from "./site";
import { STACK_IDS, STACKS } from "./stacks";

type Context = { readonly locale: Locale; readonly badge: string };

function href(path: string): string {
  return path.startsWith("/") ? absoluteMarkdownHref(path) : path;
}

function link(text: string, target: string): string {
  return `[${text}](${href(target)})`;
}

function lines(items: ReadonlyArray<string>): string {
  return items.join("  \n");
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
  const tCommand = await getTranslations({ locale, namespace: "landing.hero.command" });
  const tFacts = await getTranslations({ locale, namespace: "landing.facts" });
  const requirement = t("nodeRequirement", {
    versions: nodeVersionsLabel(NODE_RANGE, locale, (major, minimum) =>
      t("nodeMajorFrom", { major, minimum }),
    ),
  });
  const quickstart = localizedPath(locale, "/docs/quickstart");
  return blocks(
    `# ${t("headline")}`,
    t("lead"),
    `${t("quotes.what")} ${t("quotes.how")}`,
    list([link(t("ctaPrimary"), quickstart), link(t("ctaSecondary"), GITHUB_URL)]),
    ...[HERO_DIFF_SOURCE_PANE, HERO_DIFF_TARGET_PANE].map((pane) =>
      fencedMarkdown(
        "json",
        `title="${pane.file}"`,
        pane.lines.map((line) => line.text).join("\n"),
      ),
    ),
    t("diffLabel"),
    `${tCommand("install")}: ${tCommand("installHint")}`,
    fencedMarkdown("sh", null, NPM_INSTALL_COMMAND),
    `${tCommand("prompt")}: ${tCommand("promptHint")}`,
    fencedMarkdown("text", null, AI_SETUP_PROMPT),
    `## ${tFacts("label")}`,
    list([
      `${tFacts("license")}: ${link("MIT", LICENSE_URL)}`,
      `${tFacts("providers")}: ${tFacts("providersValue", { count: MACHINE_PROVIDER_IDS.length })} (${link(tFacts("providersLink"), localizedPath(locale, "/docs/providers"))})`,
      `${tFacts("formats")}: ${link(tFacts("formatsValue", { count: SUPPORTED_FORMAT_IDS.length }), localizedPath(locale, "/docs/formats"))}`,
      `${tFacts("requirements")}: ${requirement}`,
      `${tFacts("version")}: ${tFacts("versionParts", { cli: PACKAGE_VERSION, studio: STUDIO_VERSION, mcp: MCP_VERSION })}`,
      `${tFacts("lastUpdated")}: ${formatLandingDate(LANDING_LAST_UPDATED, locale)}`,
    ]),
  );
}

function withBadge(label: string, isNew: boolean, badge: string): string {
  return isNew ? `${label} (${badge})` : label;
}

async function marquee({ locale, badge }: Context): Promise<string> {
  const t = await getTranslations({ locale, namespace: "landing.marquee" });
  return blocks(
    `## ${t("heading")}`,
    t("lead"),
    `### ${t("providers")}`,
    list(landingProviders().map((provider) => withBadge(provider.label, provider.isNew, badge))),
    link(t("allProviders"), localizedPath(locale, "/docs/providers")),
    `### ${t("formats")}`,
    list(SUPPORTED_FORMAT_IDS.map((id) => FORMAT_DISPLAY[id].label)),
    link(t("allFormats"), localizedPath(locale, "/docs/formats")),
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

async function flow({ locale }: Context): Promise<string> {
  const t = await getTranslations({ locale, namespace: "landing.flow" });
  const nodes = FLOW_NODES.map((node, index) =>
    blocks(
      `### ${index + 1}. ${t(`items.${node.id}.title`)}`,
      t(`items.${node.id}.body`, FLOW_BODY_VALUES[node.id]),
      fencedMarkdown(
        node.snippet.language,
        node.snippet.filename === undefined ? null : `title="${node.snippet.filename}"`,
        node.snippet.code.trimEnd(),
      ),
      link(t(`items.${node.id}.link`), localizedPath(locale, node.docsPath)),
      node.id === FLOW_DEMO_NODE ? t(`items.${FLOW_DEMO_NODE}.demo`) : null,
    ),
  );
  return blocks(`## ${t("heading")}`, t("lead"), ...nodes);
}

type BentoTranslator = Awaited<ReturnType<typeof getTranslations<"landing.bento">>>;

type TileMarkdown = (t: BentoTranslator, locale: Locale, badge: string) => string;

function evidence(tile: BentoTile, locale: Locale): string | null {
  if (tile.evidence.length === 0) return null;
  return lines(
    tile.evidence.map((item) => link(inlineCodeMarkdown(item.text), bentoHref(locale, item))),
  );
}

const TILE_MARKDOWN: Readonly<Record<BentoKey, TileMarkdown>> = {
  keys: (t, locale, badge) =>
    blocks(
      `${t("items.keys.variables")}:`,
      list(
        MACHINE_PROVIDER_IDS.map((id) => {
          const variable = BENTO_KEY_ENV_VARS[id];
          const notes = [
            variable.optional ? t("items.keys.optional") : null,
            variable.configurable ? t("items.keys.configurable") : null,
            providerReleaseBadge(id) === null ? null : badge,
          ].filter((note): note is string => note !== null);
          const code = inlineCodeMarkdown(id);
          const name = inlineCodeMarkdown(variable.name);
          return notes.length === 0 ? `${code}: ${name}` : `${code}: ${name} (${notes.join(", ")})`;
        }),
      ),
      list(
        (["data", "integrity", "errors"] as const).map((claim) => t(`items.keys.claims.${claim}`)),
      ),
      lines([
        link(t("items.keys.keysLink"), bentoHref(locale, BENTO_KEYS_LINK)),
        link(t("items.keys.safetyLink"), bentoHref(locale, BENTO_SAFETY_LINK)),
      ]),
    ),
  formats: (t) =>
    list(
      FORMAT_FAMILIES.map(
        (family) =>
          `${t(`items.formats.families.${family}`)}: ${formatsInFamily(family)
            .map((format) => FORMAT_DISPLAY[format].label)
            .join(", ")}`,
      ),
    ),
  providers: (t, locale, badge) =>
    blocks(
      list([
        ...PROVIDER_KINDS.map(
          (kind) =>
            `${t(`items.providers.kinds.${kind}`)}: ${providersOfKind(kind)
              .map((id) =>
                withBadge(inlineCodeMarkdown(id), providerReleaseBadge(id) !== null, badge),
              )
              .join(", ")}`,
        ),
        `${t("items.providers.kinds.none")}: ${withBadge(
          link(inlineCodeMarkdown("none"), bentoHref(locale, BENTO_NONE_LINK)),
          featureReleaseBadge("provider-none") !== null,
          badge,
        )}`,
      ]),
      link(t("items.providers.link"), bentoHref(locale, BENTO_PROVIDERS_LINK)),
    ),
  sdk: () => fencedMarkdown("ts", null, BENTO_RUN_SUMMARY_CODE.trimEnd()),
  frameworks: (t, locale) =>
    blocks(
      list(
        STACK_IDS.map((id) =>
          link(STACKS[id].name, localizedPath(locale, `${BENTO_QUICKSTART_PAGE}/${id}`)),
        ),
      ),
      link(t("items.frameworks.all"), localizedPath(locale, BENTO_QUICKSTART_PAGE)),
    ),
};

async function features({ locale, badge }: Context): Promise<string> {
  const t = await getTranslations({ locale, namespace: "landing.bento" });
  const tiles = BENTO_TILES.map((tile) =>
    blocks(
      `### ${t(`items.${tile.key}.title`)}`,
      t(`items.${tile.key}.body`),
      TILE_MARKDOWN[tile.key](t, locale, badge),
      evidence(tile, locale),
    ),
  );
  return blocks(`## ${t("heading")}`, t("lead"), ...tiles);
}

async function compare({ locale }: Context): Promise<string> {
  const t = await getTranslations({ locale, namespace: "landing.compare" });
  return blocks(
    `## ${t("heading")}`,
    t("lead"),
    `${t("caption")}:`,
    table(
      [t("columns.criterion"), ...SHORT_COLUMNS.map((column) => t(`columns.${column}`))],
      SHORT_ROWS.map((row) => [
        t(`rows.${row}.label`),
        ...SHORT_COLUMNS.map((column) => t(`rows.${row}.${column}`)),
      ]),
    ),
    t("fairness"),
    t("concession"),
    `${t("lastChecked")} ${formatLandingDate(COMPARE_LAST_CHECKED, locale)}`,
    link(t("fullLink"), localizedPath(locale, COMPARE_PATH)),
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

async function openSource({ locale }: Context): Promise<string> {
  const t = await getTranslations({ locale, namespace: "landing.openSource" });
  const steps = CONTRIBUTION_STEPS.map(
    (step, index) =>
      `${index + 1}. ${t(`steps.${step.id}.title`)}: ${t(`steps.${step.id}.body`)} ${inlineCodeMarkdown(step.command)}`,
  );
  return blocks(
    `## ${t("heading")}`,
    t("lead"),
    steps.join("\n"),
    `### ${t("linksHeading")}`,
    list([
      link("verbatra/verbatra", GITHUB_URL),
      ...OPEN_SOURCE_LINKS.map((item) => link(t(item.key), item.href)),
    ]),
    CONTRIBUTORS.length === 0
      ? null
      : blocks(
          `### ${t("contributorsHeading")}`,
          list(CONTRIBUTORS.map((contributor) => link(contributor.login, contributor.profileUrl))),
        ),
  );
}

async function finalCta({ locale }: Context): Promise<string> {
  const t = await getTranslations({ locale, namespace: "landing.closing" });
  return blocks(
    `## ${t("heading")}`,
    t("lead"),
    fencedMarkdown("sh", null, NPM_INSTALL_COMMAND),
    list([
      link(t("primary"), localizedPath(locale, "/docs/quickstart")),
      link(t("secondary"), GITHUB_URL),
    ]),
  );
}

const SECTION_MARKDOWN: Readonly<Record<LandingSectionId, (context: Context) => Promise<string>>> =
  {
    hero,
    marquee,
    playground,
    flow,
    features,
    compare,
    faq,
    openSource,
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
