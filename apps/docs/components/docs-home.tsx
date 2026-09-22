import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { HERO_BACKGROUND, HERO_BORDER } from "@/components/landing/fx/hero-wash";
import { HeroFacts } from "@/components/landing/hero-facts";
import { PackageInstall } from "@/components/landing/package-install";
import Button from "@/components/ui/button";
import { type Locale, localizedPath } from "@/lib/i18n";
import { MCP_VERSION, PACKAGE_VERSION, STUDIO_VERSION } from "@/lib/site";
import { cn } from "@/lib/utils";

const DISPLAY = { fontFamily: "var(--font-display)" } as const;

const PANEL = "rounded-xl border border-fd-border";

const PANEL_HOVER =
  "hover:border-[color:color-mix(in_srgb,var(--v-glow)_45%,var(--border-default))]";

type PackageKey = "cli" | "sdk" | "studio" | "mcp";

const PACKAGE_VERSIONS: Readonly<Record<PackageKey, string>> = {
  cli: PACKAGE_VERSION,
  sdk: PACKAGE_VERSION,
  studio: STUDIO_VERSION,
  mcp: MCP_VERSION,
};

const STEP_KEYS = ["configure", "diff", "translate", "verifyWrite"] as const;

export function DocsHomeHero({
  headline,
  lead,
  primary,
  secondary,
  locale,
}: {
  headline: string;
  lead: string;
  primary: { label: string; href: string };
  secondary: { label: string; href: string };
  locale: Locale;
}): ReactNode {
  return (
    <section className="not-prose px-2 pt-2 md:px-3">
      <div
        className="relative overflow-hidden rounded-xl border"
        style={{ background: HERO_BACKGROUND, borderColor: HERO_BORDER }}
      >
        <div className="grid justify-items-center px-4 pt-16 pb-9 text-center md:px-10 md:pt-24 md:pb-10">
          <h1
            className="max-w-[16ch] font-semibold text-[color:var(--text-strong)]"
            style={{
              ...DISPLAY,
              letterSpacing: "-0.03em",
              fontSize: "clamp(2.4rem, 5.6vw, 4.4rem)",
              lineHeight: 0.98,
              textWrap: "balance",
            }}
          >
            {headline}
          </h1>
          <p className="mt-5 max-w-[54ch] text-[17px] leading-relaxed text-fd-muted-foreground md:text-[19px]">
            {lead}
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-7 gap-y-3">
            <Button
              href={localizedPath(locale, primary.href)}
              variant="primary"
              size="lg"
              className="shadow-[0_10px_34px_-12px_color-mix(in_srgb,var(--v-purple)_85%,transparent)]"
            >
              {primary.label}
            </Button>
            <Link
              href={localizedPath(locale, secondary.href)}
              className="inline-flex min-h-11 items-center font-medium text-fd-foreground transition-colors hover:text-[color:var(--accent)]"
            >
              {secondary.label}
            </Link>
          </div>
          <div className="mt-10 flex w-full justify-center text-left">
            <PackageInstall />
          </div>
          <HeroFacts className="mt-14 w-full" />
        </div>
      </div>
    </section>
  );
}

export function DocsHomeBody({ children }: { children: ReactNode }): ReactNode {
  return (
    <div className="mx-auto grid w-full max-w-[1100px] gap-[72px] px-6 pt-16 pb-20 md:px-10">
      {children}
    </div>
  );
}

export function DocsHomeSection({
  title,
  lead,
  children,
}: {
  title: string;
  lead?: string;
  children: ReactNode;
}): ReactNode {
  return (
    <section>
      <div className="not-prose grid gap-3 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:items-end lg:gap-x-16">
        <h2
          className="max-w-[16ch] font-semibold text-fd-foreground"
          style={{
            ...DISPLAY,
            letterSpacing: "-0.03em",
            fontSize: "clamp(1.75rem, 3.4vw, 2.5rem)",
            lineHeight: 1,
            textWrap: "balance",
          }}
        >
          {title}
        </h2>
        {lead ? (
          <p className="max-w-[46ch] text-[17px] leading-relaxed text-fd-muted-foreground lg:justify-self-end lg:pb-1">
            {lead}
          </p>
        ) : null}
      </div>
      <div className="mt-8">{children}</div>
    </section>
  );
}

type PathCard = {
  href: string;
  tag: string;
  label: string;
  body: string;
  primary?: boolean;
};

export function DocsHomePaths({
  cards,
  locale,
}: {
  cards: ReadonlyArray<PathCard>;
  locale: Locale;
}): ReactNode {
  return (
    <div className="not-prose grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <Link
          key={card.href}
          href={localizedPath(locale, card.href)}
          className={cn(
            "flex flex-col gap-2 p-5 transition-[filter,border-color]",
            card.primary ? "rounded-xl hover:brightness-110" : `${PANEL} ${PANEL_HOVER}`,
          )}
          style={
            card.primary
              ? { background: "var(--accent-fill)", color: "var(--accent-fill-fg)" }
              : { background: "var(--surface-bg)" }
          }
        >
          <span
            className="vk-label"
            style={
              card.primary
                ? { color: "color-mix(in srgb, var(--accent-fill-fg) 78%, transparent)" }
                : undefined
            }
          >
            {card.tag}
          </span>
          <span
            className={cn("font-semibold", !card.primary && "text-fd-foreground")}
            style={{ ...DISPLAY, fontSize: "1.1rem", letterSpacing: "-0.01em" }}
          >
            {card.label}
          </span>
          <span
            className="text-sm leading-relaxed"
            style={{
              color: card.primary
                ? "color-mix(in srgb, var(--accent-fill-fg) 86%, transparent)"
                : "var(--text-muted)",
            }}
          >
            {card.body}
          </span>
        </Link>
      ))}
    </div>
  );
}

export function DocsHomeSteps(): ReactNode {
  const t = useTranslations("landing.how.steps");
  return (
    <ol className="not-prose mt-8 grid list-none gap-4 md:grid-cols-4">
      {STEP_KEYS.map((key, index) => (
        <li key={key} className="border-t border-fd-border pt-[18px]">
          <h3
            className="font-semibold text-fd-foreground"
            style={{ ...DISPLAY, fontSize: "1.05rem" }}
          >
            <span style={{ color: "var(--accent)" }}>{index + 1}. </span>
            {t(`${key}.title`)}
          </h3>
          <p className="mt-1.5 text-sm text-fd-muted-foreground">{t(`${key}.body`)}</p>
        </li>
      ))}
    </ol>
  );
}

type Feature = { title: string; body: string; href?: string; pkg?: PackageKey };

export function DocsHomeFeatures({
  features,
  locale,
}: {
  features: ReadonlyArray<Feature>;
  locale?: Locale;
}): ReactNode {
  return (
    <div className="not-prose grid grid-cols-1 gap-3 sm:grid-cols-2">
      {features.map((feature) => {
        const version = feature.pkg ? PACKAGE_VERSIONS[feature.pkg] : undefined;
        const content = (
          <>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="font-mono text-[13.5px] text-[color:var(--accent)]">
                {feature.title}
              </span>
              {version ? (
                <span className="font-mono text-xs text-[color:var(--text-faint)] tabular-nums">
                  {version}
                </span>
              ) : null}
            </div>
            <p className="mt-2 text-sm leading-relaxed text-fd-muted-foreground">{feature.body}</p>
          </>
        );
        const className = cn(
          PANEL,
          "block p-5 transition-[border-color]",
          feature.href && PANEL_HOVER,
        );
        const style = {
          background: "var(--surface-bg)",
          borderInlineStart: "3px solid var(--v-purple)",
        };
        return feature.href && locale ? (
          <Link
            key={feature.title}
            href={localizedPath(locale, feature.href)}
            className={className}
            style={style}
          >
            {content}
          </Link>
        ) : (
          <div key={feature.title} className={className} style={style}>
            {content}
          </div>
        );
      })}
    </div>
  );
}
