import Link from "next/link";
import { useTranslations } from "next-intl";
import { Children, cloneElement, isValidElement, type ReactNode } from "react";
import { PromptCopyButton } from "@/components/ai-setup-prompt";
import { type Locale, localizedPath } from "@/lib/i18n";
import { withInlineCode } from "@/lib/inline-code-text";
import { MCP_VERSION, PACKAGE_VERSION, STUDIO_VERSION } from "@/lib/site";
import { cn } from "@/lib/utils";
import { keepCompoundsWhole, keepLinkLabelWhole } from "@/lib/word-breaks";

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

export function DocsHomeHeader({
  eyebrow,
  headline,
  lead,
  children,
}: {
  eyebrow: string;
  headline: string;
  lead: string;
  children?: ReactNode;
}): ReactNode {
  return (
    <header className={cn("pt-8 md:pt-12", HOME_FRAME)}>
      <div className="not-prose">
        <p className="vk-label m-0">{eyebrow}</p>
        <h1 className="vk-docs-home-title mt-2 max-w-[28ch]">{headline}</h1>
        <p className="vk-docs-home-lead">{withInlineCode(lead)}</p>
      </div>
      {children}
    </header>
  );
}

type HomeTab = { label: string; href: string };

export function DocsHomeTabs({
  label,
  tabs,
  locale,
}: {
  label: string;
  tabs: ReadonlyArray<HomeTab>;
  locale: Locale;
}): ReactNode {
  return (
    <nav aria-label={label} className="vk-home-tabs not-prose">
      <div className="vk-edge-fade vk-home-tabs-scroller">
        <ul className="vk-home-tabs-track">
          {tabs.map((tab) => (
            <li key={tab.href}>
              <Link
                href={localizedPath(locale, tab.href)}
                className="vk-home-tab"
                data-umami-event="docs-home-tab"
                data-umami-event-target={tab.href}
              >
                {tab.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}

function AgentGlyph(): ReactNode {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="2.5" y="3.5" width="15" height="13" rx="2" />
      <path d="M6 8l2.5 2L6 12M10.5 12.5h3.5" />
    </svg>
  );
}

function InfoGlyph(): ReactNode {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    >
      <circle cx="10" cy="10" r="7.5" />
      <path d="M10 9v4.5M10 6.5v.01" />
    </svg>
  );
}

function keepLinkLabelsWhole(node: ReactNode): ReactNode {
  return Children.map(node, (child) => {
    if (!isValidElement<{ href?: string; children?: ReactNode }>(child)) return child;
    const { href, children } = child.props;
    if (href !== undefined && typeof children === "string") {
      return cloneElement(child, undefined, keepLinkLabelWhole(children));
    }
    return children === undefined
      ? child
      : cloneElement(child, undefined, keepLinkLabelsWhole(children));
  });
}

export function DocsHomeAgentTip({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}): ReactNode {
  return (
    <aside aria-label={title} className="vk-agent-tip">
      <div className="vk-home-callout vk-agent-tip-grid">
        <span className="vk-home-callout-icon">
          <AgentGlyph />
        </span>
        <div className="vk-home-callout-body">
          <p className="vk-home-callout-title">{title}</p>
          {keepLinkLabelsWhole(children)}
        </div>
        <div className="vk-agent-tip-action not-prose">
          <PromptCopyButton className="w-full" />
        </div>
      </div>
    </aside>
  );
}

export function DocsHomeNote({ children }: { children: ReactNode }): ReactNode {
  return (
    <aside className="vk-home-callout">
      <span className="vk-home-callout-icon">
        <InfoGlyph />
      </span>
      <div className="vk-home-callout-body">{children}</div>
    </aside>
  );
}

export function DocsHomeBody({ children }: { children: ReactNode }): ReactNode {
  return <div className={cn("grid gap-16 pt-14 pb-20", HOME_FRAME)}>{children}</div>;
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
      <div className="not-prose">
        <h2 id={id} className="vk-h4">
          {title}
        </h2>
        {lead ? (
          <p className="mt-2 max-w-[62ch] text-sm leading-7 text-pretty text-[color:var(--text-muted)]">
            {withInlineCode(lead)}
          </p>
        ) : null}
      </div>
      <div className="mt-8">{children}</div>
    </section>
  );
}

type PathCard = {
  href: string;
  goal: string;
  page: string;
  body: string;
};

export function DocsHomePaths({
  cards,
  locale,
}: {
  cards: ReadonlyArray<PathCard>;
  locale: Locale;
}): ReactNode {
  return (
    <div className="not-prose grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map((card) => (
        <Link
          key={card.href}
          href={localizedPath(locale, card.href)}
          className={cn(
            "row-span-3 grid grid-rows-subgrid gap-y-2 p-5 transition-[border-color]",
            PANEL,
            PANEL_HOVER,
          )}
          style={{ background: "var(--surface-bg)" }}
        >
          <span
            className="font-semibold"
            style={{
              ...DISPLAY,
              fontSize: "1.1rem",
              letterSpacing: "-0.01em",
              lineHeight: 1.25,
              textWrap: "balance",
              color: "var(--text-strong)",
            }}
          >
            {keepCompoundsWhole(card.goal)}
          </span>
          <span className="text-sm leading-relaxed text-[color:var(--text-muted)]">
            {card.body}
          </span>
          <span className="text-sm font-medium text-[color:var(--accent)]">{card.page}</span>
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
