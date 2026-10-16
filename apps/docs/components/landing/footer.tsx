import { PackageIcon } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { VMark } from "@/components/vmark";
import { type Locale, localizedPath, toLocale } from "@/lib/i18n";
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
type FooterCol = { col: string; titleKey: string; links: ReadonlyArray<FooterLink> };

const FOOTER_COLS: ReadonlyArray<FooterCol> = [
  {
    col: "product",
    titleKey: "cols.product.title",
    links: [
      { labelKey: "cols.product.documentation", href: "/docs", localized: true },
      { labelKey: "cols.product.cliReference", href: "/docs/cli", localized: true },
      { labelKey: "cols.product.sdk", href: "/docs/sdk", localized: true },
      { labelKey: "cols.product.studio", href: "/docs/cli/studio", localized: true },
      { labelKey: "cols.product.mcpServer", href: "/docs/cli/mcp", localized: true },
      { labelKey: "cols.product.githubAction", href: "/docs/github-action", localized: true },
    ],
  },
  {
    col: "agents",
    titleKey: "cols.agents.title",
    links: [
      { labelKey: "cols.agents.llmsIndex", href: "/llms.txt" },
      { labelKey: "cols.agents.llmsFull", href: "/llms-full.txt" },
      { labelKey: "cols.agents.aiTxt", href: "/.well-known/ai.txt" },
    ],
  },
  {
    col: "learn",
    titleKey: "cols.learn.title",
    links: [
      { labelKey: "cols.learn.howItWorks", href: "/docs/how-it-works", localized: true },
      { labelKey: "cols.learn.providers", href: "/docs/providers", localized: true },
      { labelKey: "cols.learn.formats", href: "/docs/formats", localized: true },
      { labelKey: "cols.learn.lockFile", href: "/docs/the-lock-file", localized: true },
      { labelKey: "cols.learn.configFile", href: "/docs/config-file", localized: true },
      { labelKey: "cols.learn.compare", href: "/compare", localized: true },
    ],
  },
  {
    col: "community",
    titleKey: "cols.community.title",
    links: [
      {
        labelKey: "cols.community.contributing",
        href: CONTRIBUTING_URL,
        external: true,
      },
      {
        labelKey: "cols.community.codeOfConduct",
        href: CODE_OF_CONDUCT_URL,
        external: true,
      },
      {
        labelKey: "cols.community.security",
        href: SECURITY_URL,
        external: true,
      },
      {
        labelKey: "cols.community.releases",
        href: RELEASES_URL,
        external: true,
      },
      { literal: "@verbatra/cli", href: NPM_CLI, external: true },
      { literal: "@verbatra/sdk", href: NPM_SDK, external: true },
      {
        literal: "@verbatra/studio",
        href: NPM_STUDIO,
        external: true,
      },
      {
        literal: "@verbatra/mcp",
        href: NPM_MCP,
        external: true,
      },
    ],
  },
  {
    col: "legal",
    titleKey: "cols.legal.title",
    links: [
      {
        labelKey: "cols.legal.license",
        href: LICENSE_URL,
        external: true,
      },
      ...LEGAL_PAGE_LINKS.map(({ key, path }) => ({
        labelKey: `cols.legal.${key}`,
        href: path,
        localized: true,
      })),
    ],
  },
];

const LINK_CLASS =
  "vk-tap inline-flex min-h-6 items-center underline decoration-transparent underline-offset-4 transition-colors hover:text-(--text-strong) hover:decoration-[color:color-mix(in_srgb,var(--accent)_45%,transparent)]";

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
      <a href={link.href} className={LINK_CLASS} target="_blank" rel="noreferrer noopener">
        {label}
      </a>
    );
  }
  const href = link.localized ? localizedPath(locale, link.href) : link.href;
  return (
    <a href={href} className={LINK_CLASS}>
      {label}
    </a>
  );
}

export async function FullFooter(): Promise<ReactNode> {
  const t = await getTranslations("landing.footer");
  const locale = toLocale(await getLocale());
  return (
    <footer className="vk-footer">
      <div className="vk-gutter vk-w-wide mx-auto py-12 md:py-16">
        <div className="grid grid-cols-2 gap-x-6 gap-y-8 md:grid-cols-3 md:gap-x-8 md:gap-y-12 lg:grid-cols-[1.4fr_repeat(5,1fr)]">
          <div className="col-span-2 md:col-span-3 lg:col-span-1">
            <span className="inline-flex items-center gap-2.5">
              <VMark size={30} />
              <span
                className="text-xl font-semibold tracking-tight text-(--text-strong)"
                style={{ fontFamily: "var(--font-display)" }}
              >
                verbatra
              </span>
            </span>
            <p className="mt-4 max-w-[34ch] text-sm leading-relaxed text-(--text-muted)">
              {t("tagline")}
            </p>
            <div className="mt-5 flex items-center gap-5">
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noreferrer noopener"
                aria-label={t("githubAria")}
                className="vk-tap inline-flex min-h-6 items-center gap-2 text-sm text-(--text-muted) transition-colors hover:text-(--text-strong)"
              >
                <GithubIcon size={16} />
                <span>GitHub</span>
              </a>
              <a
                href={NPM_ORG}
                target="_blank"
                rel="noreferrer noopener"
                aria-label={t("npmAria")}
                className="vk-tap inline-flex min-h-6 items-center gap-2 text-sm text-(--text-muted) transition-colors hover:text-(--text-strong)"
              >
                <PackageIcon size={16} aria-hidden="true" className="shrink-0" />
                <span>npm</span>
              </a>
            </div>
          </div>
          {FOOTER_COLS.map((col) => {
            const title = t(col.titleKey);
            return (
              <nav key={col.col} aria-label={title}>
                <p className="mb-3 text-sm font-medium text-(--text-strong) md:mb-4">{title}</p>
                <ul className="flex flex-col gap-0 text-sm text-(--text-muted) md:gap-2.5">
                  {col.links.map((link) => (
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
        <div
          className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 pt-6 text-sm text-(--text-muted) md:mt-14"
          style={{
            borderTop: "1px solid color-mix(in srgb, var(--border-default) 80%, transparent)",
          }}
        >
          <span>{t("legalLicense")}</span>
          <span>{t("legalCopyright")}</span>
        </div>
      </div>
    </footer>
  );
}
