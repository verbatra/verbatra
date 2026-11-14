import { getTranslations } from "next-intl/server";
import { availableFromCopy } from "@/components/available-from";
import { LICENSE_URL } from "@/components/landing/links";
import {
  type ArtifactBlock,
  type ArtifactWords,
  artifactLineText,
  FEATURE_ARTIFACTS,
} from "./feature-artifacts";
import {
  GATE_CHECK_COMMAND,
  GATE_CHECK_EXIT_CODE,
  GATE_CHECK_HEADER,
  GATE_CHECK_LINES,
  GATE_DE_CANDIDATE,
  GATE_DE_OLD,
  GATE_DOCS_PATH,
  GATE_KEY,
  GATE_LOCALE,
  GATE_MODEL,
  GATE_PLACEHOLDER,
  GATE_REFUSED_BADGE,
  GATE_REFUSED_LINES,
  GATE_SOURCE,
  GATE_SOURCE_BEFORE,
  GATE_SOURCE_FILE,
  GATE_TARGET_FILE,
  GATE_TRANSLATE_COMMAND,
  GATE_TRANSLATE_HEADER,
} from "./gate-demo";
import {
  HERO_CHECK_BADGE,
  HERO_TRANSLATE_BADGE,
  HERO_TRANSLATE_COMMAND,
  HERO_TRANSLATE_LOCALE_LINES,
  HERO_TRANSLATE_OUTPUT,
} from "./hero-terminal";
import {
  LOCK_STATE_STALE,
  RAIL_ENTRIES,
  STUDIO_COLUMNS,
  STUDIO_ROW,
  SURFACE_CODE,
  SURFACE_COUNTS,
  SURFACE_DOCS_PATHS,
  type Surface,
  surfaceText,
} from "./highlights-surfaces";
import { type Locale, localizedPath } from "./i18n";
import {
  DRY_RUN_COMMAND,
  HERO_INSTALL_COMMAND,
  INIT_COMMAND,
  MCP_ADD_COMMAND,
  SDK_INSTALL_COMMAND,
} from "./install-commands";
import { COMPARE_PATH } from "./landing-compare";
import { FORMAT_DISPLAY, SUPPORTED_FORMAT_IDS } from "./landing-facts";
import { FAQ_ANSWER_LINKS, FAQ_ASIDE_LINKS, FAQ_ITEM_IDS, faqHref, faqValues } from "./landing-faq";
import { LANDING_FEATURES } from "./landing-features";
import {
  PLAYGROUND_METADATA,
  PLAYGROUND_SOURCE_LOCALE,
  playgroundFileName,
  playgroundGeneratedOn,
} from "./landing-playground";
import { PROOF_IDS, proofHref } from "./landing-proof";
import { landingProviders } from "./landing-providers";
import { LANDING_SECTIONS, type LandingSectionId } from "./landing-sections";
import { fencedMarkdown, inlineCodeMarkdown, markupChunks } from "./llm-markdown";
import {
  codeLinesText,
  type LineMark,
  LOCK_DEMO_COUNTS,
  LOCK_DEMO_LOCALE,
  LOCK_FILE_NAME,
  lockDemoSourceLines,
  lockDemoTranslationLines,
  lockLines,
} from "./lock-demo";
import { absoluteMarkdownHref } from "./markdown-links";
import { pageFrontmatter } from "./page-frontmatter";
import { RELEASE_BADGE } from "./release-badge";
import { COVERAGE_THRESHOLD } from "./site";

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
    t("lead"),
    list([
      link(t("ctaPrimary"), quickstart),
      link(t("ctaCompare"), localizedPath(locale, COMPARE_PATH)),
    ]),
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

async function lockDemo({ locale }: Context): Promise<string> {
  const t = await getTranslations({ locale, namespace: "landing.lockDemo" });
  const generated = playgroundGeneratedOn(locale).text;
  const { changed, unchanged } = LOCK_DEMO_COUNTS;
  const sourceFile = playgroundFileName(PLAYGROUND_SOURCE_LOCALE);
  const words = {
    gap: (count: number) => t("gap", { count }),
    mark: (mark: LineMark) => t(`tags.${mark}`),
  };
  return blocks(
    `## ${t("label")}`,
    t("heading", { count: changed }),
    list([
      `**${t("edit.label")}**: ${t("edit.text", { count: changed })}`,
      `**${t("compare.label")}**: ${t("compare.text", { count: changed })}`,
      `**${t("send.label")}**: ${t("send.text", { count: changed, rest: unchanged })}`,
    ]),
    `**${sourceFile}** ${t("badge.changed", { count: changed })}`,
    fencedMarkdown("json", null, codeLinesText(lockDemoSourceLines(), words)),
    `**${LOCK_FILE_NAME}** ${HERO_CHECK_BADGE}`,
    fencedMarkdown("json", null, codeLinesText(lockLines(), words)),
    t("foot.compare", { file: sourceFile, count: unchanged }),
    `**${HERO_TRANSLATE_OUTPUT[0] ?? ""}** ${HERO_TRANSLATE_BADGE}`,
    fencedMarkdown(
      "text",
      null,
      [`$ ${HERO_TRANSLATE_COMMAND}`, `  ${HERO_TRANSLATE_LOCALE_LINES[0] ?? ""}`].join("\n"),
    ),
    `**${playgroundFileName(LOCK_DEMO_LOCALE)}** ${t("preGenerated")}`,
    fencedMarkdown("json", null, codeLinesText(lockDemoTranslationLines(), words)),
    [
      `${PLAYGROUND_METADATA.model}, ${t("foot.generated", { date: generated })}`,
      t("foot.lock", { file: LOCK_FILE_NAME, count: changed }),
    ].join("\n"),
  );
}

async function gate({ locale }: Context): Promise<string> {
  const t = await getTranslations({ locale, namespace: "landing.gate" });
  const [group = "", leaf = ""] = GATE_KEY.split(".");
  const targetFile = [`"${group}": {`, `  ${JSON.stringify(leaf)}: "${GATE_DE_OLD}"`, "}"].join(
    "\n",
  );
  return blocks(
    `## ${t("heading")}`,
    `${t("lead")} ${link(GATE_DOCS_PATH.slice(1), localizedPath(locale, GATE_DOCS_PATH))}`,
    list([
      `**${t("candidate.label")}**: ${t("candidate.text", { key: GATE_KEY, file: GATE_SOURCE_FILE, placeholder: GATE_PLACEHOLDER })}`,
      `**${t("refused.label")}**: ${t("refused.text")}`,
      `**${t("stale.label")}**: ${t("stale.text")}`,
    ]),
    `**${GATE_KEY}** ${GATE_MODEL}`,
    `**${GATE_SOURCE_FILE}** ${t("candidate.edited")}`,
    fencedMarkdown("text", null, [`- "${GATE_SOURCE_BEFORE}"`, `+ "${GATE_SOURCE}"`].join("\n")),
    `**${GATE_LOCALE}** ${t("candidate.answer")}`,
    fencedMarkdown(
      "text",
      null,
      `"${GATE_DE_CANDIDATE}" ${GATE_PLACEHOLDER} ${t("candidate.missing")}`,
    ),
    t("candidate.foot"),
    `**${GATE_TRANSLATE_HEADER}** ${t("refused.stamp")} ${GATE_REFUSED_BADGE}`,
    fencedMarkdown("text", null, [`$ ${GATE_TRANSLATE_COMMAND}`, ...GATE_REFUSED_LINES].join("\n")),
    `**${GATE_TARGET_FILE}** ${t("refused.unchanged")}`,
    fencedMarkdown("json", null, targetFile),
    `**${GATE_CHECK_HEADER}** exit ${GATE_CHECK_EXIT_CODE}`,
    fencedMarkdown("text", null, [`$ ${GATE_CHECK_COMMAND}`, ...GATE_CHECK_LINES].join("\n")),
    `**${GATE_TARGET_FILE}** ${t("refused.unchanged")}`,
    fencedMarkdown("json", null, targetFile),
    t("stale.foot", { file: GATE_TARGET_FILE, placeholder: GATE_PLACEHOLDER }),
  );
}

async function highlights({ locale }: Context): Promise<string> {
  const t = await getTranslations({ locale, namespace: "landing.highlights" });
  const surface = (id: Surface, ...body: ReadonlyArray<string>): ReadonlyArray<string> => [
    `### ${t(`surfaces.${id}`)}`,
    ...body,
    link(SURFACE_DOCS_PATHS[id].slice(1), localizedPath(locale, SURFACE_DOCS_PATHS[id])),
  ];
  return blocks(
    `## ${t("heading")}`,
    t("lead", { stale: SURFACE_COUNTS.stale, upToDate: SURFACE_COUNTS.upToDate }),
    `**${LOCK_FILE_NAME}** ${HERO_CHECK_BADGE}`,
    fencedMarkdown(
      "text",
      null,
      RAIL_ENTRIES.map(
        ({ key, hash, comma }) =>
          `${JSON.stringify(key)}: ${JSON.stringify(hash)}${comma ? "," : ""} ${LOCK_STATE_STALE}`,
      ).join("\n"),
    ),
    ...surface("cli", fencedMarkdown("text", null, surfaceText(SURFACE_CODE.cli))),
    ...surface(
      "studio",
      [
        `| ${STUDIO_COLUMNS.join(" | ")} |`,
        `| ${STUDIO_COLUMNS.map(() => "---").join(" | ")} |`,
        `| ${[
          STUDIO_ROW.locale,
          `${STUDIO_ROW.percent}% ${STUDIO_ROW.keys}`,
          STUDIO_ROW.missing,
          STUDIO_ROW.stale,
          STUDIO_ROW.upToDate,
        ].join(" | ")} |`,
      ].join("\n"),
    ),
    ...surface(
      "sdk",
      fencedMarkdown("ts", null, surfaceText(SURFACE_CODE.sdk)),
      fencedMarkdown("sh", null, SDK_INSTALL_COMMAND),
    ),
    ...surface(
      "mcp",
      t("mcp.badge"),
      fencedMarkdown("text", null, surfaceText(SURFACE_CODE.mcp)),
      fencedMarkdown("sh", null, MCP_ADD_COMMAND),
    ),
  );
}

function artifactMarkdown(block: ArtifactBlock, words: ArtifactWords, empty: string): string {
  if (block.kind === "shot") return "";
  if (block.kind === "sheet") {
    const row = (cells: ReadonlyArray<string>) =>
      `| ${cells.map((cell) => (cell === "" ? empty : cell)).join(" | ")} |`;
    return [row(block.columns), row(block.columns.map(() => "---")), ...block.rows.map(row)].join(
      "\n",
    );
  }
  return fencedMarkdown(
    block.kind === "cli" ? "text" : "ts",
    null,
    block.lines.map((line) => artifactLineText(line, words)).join("\n"),
  );
}

async function features({ locale }: Context): Promise<string> {
  const t = await getTranslations({ locale, namespace: "landing.features" });
  const words: ArtifactWords = {
    more: (count) => t("more", { count }),
    moreChecks: () => t("moreChecks"),
  };
  return blocks(
    `## ${t("label")}: ${t("heading")}`,
    t("lead"),
    ...LANDING_FEATURES.flatMap(({ id, command, docsPath }) => {
      const artifact = FEATURE_ARTIFACTS[id];
      return [
        `### ${t(`items.${id}.title`)}`,
        t(`items.${id}.body`),
        link(inlineCodeMarkdown(command), localizedPath(locale, docsPath)),
        `**${artifact.head}** ${t(`badges.${id}`, { count: artifact.count ?? 0 })}`,
        ...artifact.blocks.map((block) => artifactMarkdown(block, words, t("emptyCell"))),
      ];
    }),
  );
}

async function finalCta({ locale }: Context): Promise<string> {
  const t = await getTranslations({ locale, namespace: "landing.closing" });
  return blocks(
    `## ${t("heading")}`,
    t("label"),
    t("lead"),
    fencedMarkdown("sh", null, `${INIT_COMMAND}\n${DRY_RUN_COMMAND}`),
    list(
      PROOF_IDS.map((id) =>
        link(t(`proof.${id}`, { threshold: COVERAGE_THRESHOLD }), proofHref(id, locale)),
      ),
    ),
  );
}

const SECTION_MARKDOWN: Readonly<Record<LandingSectionId, (context: Context) => Promise<string>>> =
  {
    hero,
    marquee,
    lockDemo,
    gate,
    highlights,
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
