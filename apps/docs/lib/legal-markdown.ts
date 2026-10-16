import { getTranslations } from "next-intl/server";
import { type Locale, localizedPath } from "./i18n";
import {
  IMPRINT_EMAIL,
  IMPRINT_EMAIL_LABEL,
  IMPRINT_LICENSE_HEADING,
  IMPRINT_PROVIDER_HEADING,
  IMPRINT_PROVIDER_LINES,
  IMPRINT_TITLE,
  imprintLicenseRuns,
} from "./legal-imprint";
import { PRIVACY_OBJECTION_KEY, PRIVACY_SECTION_KEYS, privacyLinkHrefs } from "./legal-privacy";
import { fallbackTexts, LICENSES, textsUsedBy, usageCount } from "./licenses-manifest";
import { fencedMarkdown, inlineCodeMarkdown, markupChunks } from "./llm-markdown";
import { absoluteMarkdownHref } from "./markdown-links";
import { pageFrontmatter } from "./page-frontmatter";
import { LEGAL_LAST_UPDATED, PRIVACY_CONTACT_FORM_ANCHOR } from "./site";
import {
  type LicensedPackage,
  type LicenseGroup,
  type LicenseText,
  licenseTermsUrl,
} from "./third-party-licenses";

function href(target: string): string {
  return target.startsWith("/") ? absoluteMarkdownHref(target) : target;
}

function link(text: string, target: string): string {
  return `[${text}](${href(target)})`;
}

function blocks(...parts: ReadonlyArray<string | null>): string {
  return parts.filter((part): part is string => part !== null && part !== "").join("\n\n");
}

function linkTags(
  hrefs: Readonly<Record<string, string>>,
): Record<string, (chunks: string) => string> {
  return Object.fromEntries(
    Object.entries(hrefs).map(([tag, target]) => [
      tag,
      (chunks: string) => link(markupChunks(chunks), target),
    ]),
  );
}

async function frontmatter(
  locale: Locale,
  namespace: "imprint" | "privacy" | "contact" | "licenses",
) {
  const t = await getTranslations({ locale, namespace: `legal.${namespace}.meta` });
  return pageFrontmatter({ title: t("title"), description: t("description") }).trimEnd();
}

export async function imprintMarkdown(locale: Locale): Promise<string> {
  const t = await getTranslations({ locale, namespace: "legal.imprint" });
  const license = imprintLicenseRuns(locale)
    .map((run) => (typeof run === "string" ? run : link(run.text, run.href)))
    .join("");
  return blocks(
    await frontmatter(locale, "imprint"),
    `# ${IMPRINT_TITLE}`,
    t("intro"),
    `*${t("lastUpdatedLabel")}: ${LEGAL_LAST_UPDATED}*`,
    `## ${IMPRINT_PROVIDER_HEADING}`,
    [
      ...IMPRINT_PROVIDER_LINES,
      `${IMPRINT_EMAIL_LABEL}: ${link(IMPRINT_EMAIL, `mailto:${IMPRINT_EMAIL}`)}`,
    ].join("  \n"),
    t.markup("contactLinkNote", linkTags({ link: localizedPath(locale, "/contact") })),
    `## ${IMPRINT_LICENSE_HEADING}`,
    license,
  );
}

export async function privacyMarkdown(locale: Locale): Promise<string> {
  const t = await getTranslations({ locale, namespace: "legal.privacy" });
  const tags = {
    ...linkTags(privacyLinkHrefs(locale)),
    strong: (chunks: string) => `**${markupChunks(chunks)}**`,
  };
  const lastUpdated = `*${t("lastUpdatedLabel")}: ${LEGAL_LAST_UPDATED}*`;
  const sections = PRIVACY_SECTION_KEYS.map((key) => {
    const body = t.markup(`${key}.body`, tags);
    return blocks(`## ${t(`${key}.heading`)}`, key === PRIVACY_OBJECTION_KEY ? `> ${body}` : body);
  });
  return blocks(
    await frontmatter(locale, "privacy"),
    `# ${t("title")}`,
    lastUpdated,
    `*${t("languageVersions")}*`,
    ...sections,
    lastUpdated,
  );
}

export async function contactMarkdown(locale: Locale): Promise<string> {
  const t = await getTranslations({ locale, namespace: "legal.contact" });
  const imprint = linkTags({ imprint: localizedPath(locale, "/imprint") });
  const privacy = linkTags({
    privacy: `${localizedPath(locale, "/privacy")}#${PRIVACY_CONTACT_FORM_ANCHOR}`,
  });
  return blocks(
    await frontmatter(locale, "contact"),
    `# ${t("title")}`,
    t.markup("intro", imprint),
    t.markup("form.noScript", imprint),
    t.markup("privacyNotice", privacy),
    link(t("title"), localizedPath(locale, "/contact")),
  );
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function textBlock(text: LicenseText, users: number): string {
  return blocks(
    `### License text ${text.id} (${text.license}, used by ${plural(users, "entry", "entries")})`,
    fencedMarkdown("text", null, text.text.trimEnd()),
  );
}

function packageLine(pkg: LicensedPackage, group: LicenseGroup): string {
  const owner =
    pkg.copyright.length > 0
      ? pkg.copyright.join("; ")
      : pkg.author === null
        ? null
        : `Author: ${pkg.author}`;
  const terms = licenseTermsUrl(group.license);
  const text =
    pkg.textId !== null
      ? `License text: ${pkg.textId}`
      : group.fallbackTextIds.length === 0 && terms !== null
        ? `No license file in the package; license terms: ${terms}`
        : `No license file in the package; license text: ${group.fallbackTextIds.join(", ")}`;
  return `- ${[inlineCodeMarkdown(`${pkg.name}@${pkg.version}`), owner, text]
    .filter((part): part is string => part !== null)
    .join(". ")}`;
}

function notices(group: LicenseGroup): ReadonlyArray<string> {
  return group.packages.flatMap((pkg) =>
    pkg.notice === null
      ? []
      : [
          blocks(
            `#### NOTICE: ${pkg.name}@${pkg.version}`,
            fencedMarkdown("text", null, pkg.notice.trimEnd()),
          ),
        ],
  );
}

function groupMarkdown(group: LicenseGroup): string {
  return blocks(
    `## ${group.license} (${plural(group.packages.length, "package", "packages")})`,
    group.packages.map((pkg) => packageLine(pkg, group)).join("\n"),
    ...notices(group),
    ...textsUsedBy(group.packages).map((text) =>
      textBlock(text, usageCount(group.packages, text.id)),
    ),
    ...fallbackTexts(group).map((text) => textBlock(text, usageCount(group.packages, null))),
  );
}

export async function licensesMarkdown(locale: Locale): Promise<string> {
  const t = await getTranslations({ locale, namespace: "legal.licenses" });
  const assets = LICENSES.assets.map(
    (asset) =>
      `- ${[`**${asset.name}**`, `License: ${asset.license}`, asset.usage, ...asset.copyright].join(". ")}`,
  );
  return blocks(
    await frontmatter(locale, "licenses"),
    `# ${t("title")}`,
    t("intro"),
    `${LICENSES.packageCount} packages in ${LICENSES.groups.length} license groups, plus ${LICENSES.assets.length} assets.`,
    "## Fonts and other assets",
    assets.join("\n"),
    ...textsUsedBy(LICENSES.assets).map((text) =>
      textBlock(text, usageCount(LICENSES.assets, text.id)),
    ),
    ...LICENSES.groups.map(groupMarkdown),
  );
}
