import { PackageIcon } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { LocaleLinks } from "@/components/locale-links";
import { VMark } from "@/components/vmark";
import { type Locale, localizedPath, toLocale } from "@/lib/i18n";
import { MCP_VERSION, PACKAGE_VERSION, STUDIO_VERSION } from "@/lib/site";
import { GithubIcon } from "./github-icon";
import {
  CODE_OF_CONDUCT_URL,
  CONTRIBUTING_URL,
  GITHUB_URL,
  LEGAL_PAGE_LINKS,
  LICENSE_URL,
  NPM_CLI,
  NPM_MCP,
  NPM_ORG,
  NPM_SDK,
  NPM_STUDIO,
  RELEASES_URL,
  SECURITY_URL,
} from "./links";

type FooterLink = {
  labelKey?: string;
  literal?: string;
  href: string;
  external?: boolean;
  localized?: boolean;
};

type FooterGroup = {
  group: "product" | "packages" | "community" | "legal";
  titleKey: string;
  links: ReadonlyArray<FooterLink>;
};

export const FOOTER_GROUPS: ReadonlyArray<FooterGroup> = [
  {
    group: "product",
    titleKey: "cols.product.title",
    links: [
      { labelKey: "cols.product.documentation", href: "/docs", localized: true },
      { labelKey: "cols.product.cliReference", href: "/docs/cli", localized: true },
      { labelKey: "cols.product.sdk", href: "/docs/sdk", localized: true },
      { labelKey: "cols.product.studio", href: "/docs/cli/studio", localized: true },
      { labelKey: "cols.product.mcpServer", href: "/docs/cli/mcp", localized: true },
      { labelKey: "cols.product.githubAction", href: "/docs/github-action", localized: true },
      { labelKey: "cols.learn.howItWorks", href: "/docs/how-it-works", localized: true },
      { labelKey: "cols.learn.providers", href: "/docs/providers", localized: true },
      { labelKey: "cols.learn.formats", href: "/docs/formats", localized: true },
      { labelKey: "cols.learn.lockFile", href: "/docs/the-lock-file", localized: true },
      { labelKey: "cols.learn.configFile", href: "/docs/config-file", localized: true },
      { labelKey: "cols.learn.compare", href: "/compare", localized: true },
      { labelKey: "cols.agents.llmsIndex", href: "/llms.txt" },
      { labelKey: "cols.agents.llmsFull", href: "/llms-full.txt" },
      { labelKey: "cols.agents.aiTxt", href: "/.well-known/ai.txt" },
    ],
  },
  {
    group: "packages",
    titleKey: "cols.packages.title",
    links: [
      { literal: "@verbatra/cli", href: NPM_CLI, external: true },
      { literal: "@verbatra/sdk", href: NPM_SDK, external: true },
      { literal: "@verbatra/studio", href: NPM_STUDIO, external: true },
      { literal: "@verbatra/mcp", href: NPM_MCP, external: true },
      { labelKey: "cols.community.releases", href: RELEASES_URL, external: true },
    ],
  },
  {
    group: "community",
    titleKey: "cols.community.title",
    links: [
      { labelKey: "cols.community.contributing", href: CONTRIBUTING_URL, external: true },
      { labelKey: "cols.community.codeOfConduct", href: CODE_OF_CONDUCT_URL, external: true },
      { labelKey: "cols.community.security", href: SECURITY_URL, external: true },
    ],
  },
  {
    group: "legal",
    titleKey: "cols.legal.title",
    links: [
      { labelKey: "cols.legal.license", href: LICENSE_URL, external: true },
      ...LEGAL_PAGE_LINKS.map(({ key, path }) => ({
        labelKey: `cols.legal.${key}`,
        href: path,
        localized: true,
      })),
    ],
  },
];

function FooterLinkItem({
  link,
  label,
  locale,
}: {
  link: FooterLink;
  label: string;
  locale: Locale;
}): ReactNode {
  if (link.external) {
    return (
      <a
        href={link.href}
        className="vk-tap vk-footer-link"
        target="_blank"
        rel="noreferrer noopener"
      >
        {label}
      </a>
    );
  }
  const href = link.localized ? localizedPath(locale, link.href) : link.href;
  return (
    <a href={href} className="vk-tap vk-footer-link">
      {label}
    </a>
  );
}

const PROFILE_LINK = "vk-tap vk-footer-profile";

export async function FullFooter(): Promise<ReactNode> {
  const t = await getTranslations("landing.footer");
  const tFacts = await getTranslations("landing.facts");
  const locale = toLocale(await getLocale());
  return (
    <footer className="vk-footer">
      <div className="vk-gutter vk-w-wide mx-auto">
        <div className="vk-footer-top">
          <div className="vk-footer-brand">
            <span className="inline-flex items-center gap-2.5">
              <VMark size={26} />
              <span className="vk-footer-wordmark">verbatra</span>
            </span>
            <p className="vk-footer-tagline">{t("tagline")}</p>
          </div>
          <div className="vk-footer-profiles">
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer noopener"
              aria-label={t("githubAria")}
              className={PROFILE_LINK}
            >
              <GithubIcon size={16} />
              <span>GitHub</span>
            </a>
            <a
              href={NPM_ORG}
              target="_blank"
              rel="noreferrer noopener"
              aria-label={t("npmAria")}
              className={PROFILE_LINK}
            >
              <PackageIcon size={16} aria-hidden="true" className="shrink-0" />
              <span>npm</span>
            </a>
          </div>
        </div>
        <div className="vk-footer-groups vk-grid-12">
          {FOOTER_GROUPS.map((group) => {
            const title = t(group.titleKey);
            return (
              <nav
                key={group.group}
                aria-label={title}
                data-group={group.group}
                className="vk-footer-group"
              >
                <p className="vk-footer-group-title">{title}</p>
                <ul>
                  {group.links.map((link) => (
                    <li key={link.literal ?? link.labelKey}>
                      <FooterLinkItem
                        link={link}
                        label={link.literal ?? t(link.labelKey ?? "")}
                        locale={locale}
                      />
                    </li>
                  ))}
                </ul>
              </nav>
            );
          })}
        </div>
        <div className="vk-footer-bottom">
          <LocaleLinks label={t("language")} current={locale} />
          <p className="vk-footer-meta">
            <span>
              {tFacts("versionParts", {
                cli: PACKAGE_VERSION,
                studio: STUDIO_VERSION,
                mcp: MCP_VERSION,
              })}
            </span>
            <span>{t("legalLicense")}</span>
            <span>{t("legalCopyright")}</span>
          </p>
        </div>
      </div>
    </footer>
  );
}
