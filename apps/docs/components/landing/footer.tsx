import { SiNpm } from "@icons-pack/react-simple-icons";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { VMark } from "@/components/landing";
import { GRID_PATTERN_STYLE } from "./fx/grid-pattern";
import { GithubIcon } from "./github-icon";
import {
  CODE_OF_CONDUCT_URL,
  GITHUB_URL,
  NPM_CLI,
  NPM_MCP,
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
  trackingTarget?: string;
};
type FooterCol = { col: string; titleKey: string; links: ReadonlyArray<FooterLink> };

const FOOTER_COLS: ReadonlyArray<FooterCol> = [
  {
    col: "product",
    titleKey: "cols.product.title",
    links: [
      { labelKey: "cols.product.documentation", href: "/docs" },
      { labelKey: "cols.product.cliReference", href: "/docs/cli" },
      { labelKey: "cols.product.sdk", href: "/docs/sdk" },
      { labelKey: "cols.product.studio", href: "/docs/cli/studio" },
      { labelKey: "cols.product.mcpServer", href: "/docs/cli/mcp" },
      { labelKey: "cols.product.githubAction", href: "/docs/github-action" },
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
      { labelKey: "cols.learn.howItWorks", href: "/docs/how-it-works" },
      { labelKey: "cols.learn.providers", href: "/docs/providers" },
      { labelKey: "cols.learn.formats", href: "/docs/formats" },
      { labelKey: "cols.learn.lockFile", href: "/docs/the-lock-file" },
      { labelKey: "cols.learn.configFile", href: "/docs/config-file" },
    ],
  },
  {
    col: "community",
    titleKey: "cols.community.title",
    links: [
      {
        labelKey: "cols.community.codeOfConduct",
        href: CODE_OF_CONDUCT_URL,
        external: true,
        trackingTarget: "code-of-conduct",
      },
      {
        labelKey: "cols.community.security",
        href: SECURITY_URL,
        external: true,
        trackingTarget: "security",
      },
      {
        labelKey: "cols.community.releases",
        href: RELEASES_URL,
        external: true,
        trackingTarget: "releases",
      },
      { literal: "@verbatra/sdk", href: NPM_SDK, external: true, trackingTarget: "npm-sdk" },
      {
        literal: "@verbatra/studio",
        href: NPM_STUDIO,
        external: true,
        trackingTarget: "npm-studio",
      },
      { literal: "@verbatra/mcp", href: NPM_MCP, external: true, trackingTarget: "npm-mcp" },
    ],
  },
  {
    col: "legal",
    titleKey: "cols.legal.title",
    links: [
      {
        literal: "MIT License",
        href: `${GITHUB_URL}/blob/main/LICENSE`,
        external: true,
        trackingTarget: "license",
      },
      { labelKey: "cols.legal.privacy", href: "/privacy" },
      { labelKey: "cols.legal.imprint", href: "/imprint" },
      { labelKey: "cols.legal.contact", href: "/contact" },
    ],
  },
];

const LINK_CLASS =
  "underline decoration-transparent underline-offset-4 transition-colors hover:text-fd-foreground hover:decoration-[color:color-mix(in_srgb,var(--v-glow)_45%,transparent)]";

function FooterLinkItem({ link, label }: { link: FooterLink; label: string }): ReactNode {
  if (link.external) {
    return (
      <a
        href={link.href}
        className={LINK_CLASS}
        target="_blank"
        rel="noreferrer noopener"
        data-umami-event="outbound-link"
        data-umami-event-target={link.trackingTarget}
      >
        {label}
      </a>
    );
  }
  return (
    <a href={link.href} className={LINK_CLASS}>
      {label}
    </a>
  );
}

export async function FullFooter(): Promise<ReactNode> {
  const t = await getTranslations("landing.footer");
  return (
    <footer
      className="relative overflow-hidden"
      style={{
        background:
          "linear-gradient(to bottom, color-mix(in srgb, var(--v-void) 55%, var(--surface-card)), color-mix(in srgb, var(--v-void) 78%, var(--surface-card)))",
      }}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{
          background:
            "linear-gradient(90deg, transparent, color-mix(in srgb, var(--v-glow) 55%, transparent) 50%, transparent)",
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          ...GRID_PATTERN_STYLE,
          opacity: 0.28,
          WebkitMaskImage: "linear-gradient(to bottom, #000, transparent 55%)",
          maskImage: "linear-gradient(to bottom, #000, transparent 55%)",
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 overflow-hidden"
      >
        <span
          className="block select-none text-center font-semibold"
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "clamp(4rem, 24vw, 15rem)",
            lineHeight: 0.82,
            letterSpacing: "-0.04em",
            background: "var(--gradient-headline)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
            opacity: 0.08,
            transform: "translateY(0.12em)",
            WebkitMaskImage: "linear-gradient(to top, #000 8%, transparent 82%)",
            maskImage: "linear-gradient(to top, #000 8%, transparent 82%)",
          }}
        >
          verbatra
        </span>
      </div>

      <div className="relative z-10 mx-auto max-w-6xl px-6 py-16">
        <div className="grid gap-x-8 gap-y-12 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-[1.4fr_repeat(5,1fr)]">
          <div>
            <span className="inline-flex items-center gap-2.5">
              <VMark size={30} />
              <span
                className="text-xl font-semibold tracking-tight text-fd-foreground"
                style={{ fontFamily: "var(--font-display)" }}
              >
                verbatra
              </span>
            </span>
            <p className="mt-4 max-w-[34ch] text-sm leading-relaxed text-fd-muted-foreground">
              {t("tagline")}
            </p>
            <div className="mt-5 flex items-center gap-5">
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noreferrer noopener"
                aria-label={t("githubAria")}
                className="inline-flex items-center gap-2 text-sm text-fd-muted-foreground transition-colors hover:text-fd-foreground"
                data-umami-event="outbound-link"
                data-umami-event-target="github"
              >
                <GithubIcon size={16} />
                <span>GitHub</span>
              </a>
              <a
                href={NPM_CLI}
                target="_blank"
                rel="noreferrer noopener"
                aria-label={t("npmAria")}
                className="inline-flex items-center gap-2 text-sm text-fd-muted-foreground transition-colors hover:text-fd-foreground"
                data-umami-event="outbound-link"
                data-umami-event-target="npm"
              >
                <SiNpm size={16} color="currentColor" aria-hidden="true" className="shrink-0" />
                <span>npm</span>
              </a>
            </div>
          </div>
          {FOOTER_COLS.map((col) => {
            const title = t(col.titleKey);
            return (
              <nav key={col.col} aria-label={title}>
                <p className="mb-4 font-mono text-xs uppercase tracking-[0.14em] text-[color:var(--text-faint)]">
                  {title}
                </p>
                <ul className="flex flex-col gap-2.5 text-sm text-fd-muted-foreground">
                  {col.links.map((link) => (
                    <li key={link.literal ?? link.labelKey}>
                      <FooterLinkItem link={link} label={link.literal ?? t(link.labelKey ?? "")} />
                    </li>
                  ))}
                </ul>
              </nav>
            );
          })}
        </div>
        <div
          className="mt-14 flex flex-wrap items-center gap-x-4 gap-y-2 pt-6 text-sm text-fd-muted-foreground"
          style={{
            borderTop: "1px solid color-mix(in srgb, var(--border-default) 80%, transparent)",
          }}
        >
          <span>{t("legalLine")}</span>
        </div>
      </div>
    </footer>
  );
}
