import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { PackageInstall } from "@/components/landing/package-install";
import { type Locale, localizedPath } from "@/lib/i18n";
import { withInlineCode } from "@/lib/inline-code-text";
import { MCP_VERSION, PACKAGE_VERSION, STUDIO_VERSION } from "@/lib/site";
import { cn } from "@/lib/utils";

const DISPLAY = { fontFamily: "var(--font-display)" } as const;

const PANEL = "rounded-xl border border-fd-border";

const HOME_FRAME = "mx-auto w-full max-w-[1100px] px-4 md:px-6 lg:px-10";

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

export function DocsHomeHeader({ headline, lead }: { headline: string; lead: string }): ReactNode {
  return (
    <header
      className={cn(
        "not-prose grid gap-x-12 gap-y-6 pt-8 md:pt-12 lg:grid-cols-[minmax(0,1fr)_var(--width-install)] lg:items-end",
        HOME_FRAME,
      )}
    >
      <div className="min-w-0">
        <h1 className="max-w-[22ch] font-semibold text-[color:var(--text-strong)]">{headline}</h1>
        <p className="mt-4 vk-lead">{withInlineCode(lead)}</p>
      </div>
      <div className="flex min-w-0">
        <PackageInstall />
      </div>
    </header>
  );
}

export function DocsHomeBody({ children }: { children: ReactNode }): ReactNode {
  return <div className={cn("grid gap-[72px] pt-14 pb-20", HOME_FRAME)}>{children}</div>;
}

export function DocsHomeSection({
  id,
  title,
  lead,
  children,
}: {
  id?: string;
  title: string;
  lead?: string;
  children: ReactNode;
}): ReactNode {
  return (
    <section>
      <div className="not-prose grid gap-3 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:items-baseline-last lg:gap-x-16">
        <h2
          id={id}
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
          <p className="vk-lead max-w-[46ch] text-fd-muted-foreground">{withInlineCode(lead)}</p>
        ) : null}
      </div>
      <div className="mt-8">{children}</div>
    </section>
  );
}

function keepCompoundsWhole(text: string): ReactNode {
  return text.split(/(\S*-\S*)/).map((part, index) =>
    index % 2 === 1 ? (
      <span key={`${index}-${part}`} className="whitespace-nowrap">
        {part}
      </span>
    ) : (
      part
    ),
  );
}

type PathCard = {
  href: string;
  goal: string;
  page: string;
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
            "row-span-3 grid grid-rows-subgrid gap-y-2 p-5 transition-[filter,border-color]",
            card.primary ? "rounded-xl hover:brightness-110" : `${PANEL} ${PANEL_HOVER}`,
          )}
          style={
            card.primary
              ? { background: "var(--accent-fill)", color: "var(--accent-fill-fg)" }
              : { background: "var(--surface-bg)" }
          }
        >
          <span
            className="font-semibold"
            style={{
              ...DISPLAY,
              fontSize: "1.1rem",
              letterSpacing: "-0.01em",
              lineHeight: 1.25,
              textWrap: "balance",
              color: card.primary ? undefined : "var(--text-strong)",
            }}
          >
            {keepCompoundsWhole(card.goal)}
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
          <span
            className="self-end text-sm font-medium"
            style={{
              color: card.primary
                ? "color-mix(in srgb, var(--accent-fill-fg) 92%, transparent)"
                : "var(--accent)",
            }}
          >
            {card.page}
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
              <span className="font-mono text-sm text-[color:var(--accent)]">{feature.title}</span>
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
