import Link from "next/link";
import type { ReactNode } from "react";
import { VMark } from "@/components/landing";
import { GRID_PATTERN_STYLE } from "@/components/landing/fx/grid-pattern";
import { PackageInstall } from "@/components/landing/package-install";
import { Terminal } from "@/components/landing/terminal";
import { type Locale, localizedPath } from "@/lib/i18n";

const HERO_COMMANDS = [
  "verbatra init",
  "verbatra translate",
  "verbatra diff",
  "verbatra watch",
] as const;

const HERO_OUTPUTS: Readonly<Record<number, ReadonlyArray<string>>> = {
  0: [
    "✓ created verbatra.config.ts",
    "source en · targets de, es, fr",
    "provider gemini · key from GEMINI_API_KEY",
  ],
  1: [
    "diff en.json · 12 new · 0 changed · 108 unchanged",
    "de  12 translated · 108 unchanged · 0 withheld",
    "es  12 translated · 108 unchanged · 0 withheld",
    "fr  12 translated · 108 unchanged · 0 withheld",
    "✓ 36 keys translated in 5.4s · 0 skipped · lock updated",
  ],
  2: [
    "en.json · 120 keys · source of truth",
    "de  2 new · 1 changed · 117 up to date",
    "es  0 new · 0 changed · 120 up to date",
    "fr  5 new · 0 changed · 115 up to date",
    "8 keys would be sent · run verbatra translate to apply",
  ],
  3: [
    "watching en.json for changes",
    "en.json changed · 1 new key",
    "de  1 translated · 0 withheld",
    "✓ 3 keys translated · waiting for changes",
  ],
};

function StaticBackdrop(): ReactNode {
  const fade = "radial-gradient(ellipse 75% 65% at 50% 0%, #000 35%, transparent 80%)";
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        className="absolute inset-0"
        style={{
          ...GRID_PATTERN_STYLE,
          opacity: 0.4,
          WebkitMaskImage: fade,
          maskImage: fade,
        }}
      />
      <div
        className="absolute left-1/2 top-[-30%] h-[720px] w-[min(1100px,120%)] -translate-x-1/2"
        style={{
          background:
            "radial-gradient(ellipse 50% 50% at 50% 50%, color-mix(in srgb, var(--v-violet) 22%, transparent), transparent 70%)",
          filter: "blur(30px)",
        }}
      />
    </div>
  );
}

export function DocsHomeHero({
  eyebrow,
  headline,
  lead,
  primary,
  secondary,
  locale,
}: {
  eyebrow: string;
  headline: string;
  lead: string;
  primary: { label: string; href: string };
  secondary: { label: string; href: string };
  locale: Locale;
}): ReactNode {
  return (
    <section className="not-prose relative w-full overflow-hidden border-b border-fd-border px-6 pt-14 pb-16 md:px-10 xl:pt-20">
      <StaticBackdrop />
      <div className="relative mx-auto max-w-4xl text-center">
        <div className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-[0.18em] text-fd-muted-foreground">
          <VMark size={18} blur={5} decorative />
          {eyebrow}
        </div>
        <h1
          className="vk-gradient-text mx-auto mt-5 max-w-[18ch] font-semibold"
          style={{
            fontFamily: "var(--font-display)",
            letterSpacing: "var(--tracking-tight)",
            fontSize: "clamp(2rem, 5vw, 3.25rem)",
            lineHeight: 1.06,
            textWrap: "balance",
          }}
        >
          {headline}
        </h1>
        <p className="mx-auto mt-5 max-w-[54ch] text-lg leading-relaxed text-fd-muted-foreground">
          {lead}
        </p>
        <div className="mt-7 flex justify-center">
          <PackageInstall />
        </div>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Link
            href={localizedPath(locale, primary.href)}
            className="group inline-flex items-center gap-2 rounded-[10px] px-[22px] py-[13px] text-base font-semibold text-[color:var(--accent-fill-fg)] transition-[filter] hover:brightness-[1.08]"
            style={{ background: "var(--accent-fill)" }}
          >
            {primary.label}
            <span aria-hidden="true" className="transition-transform group-hover:translate-x-0.5">
              →
            </span>
          </Link>
          <Link
            href={localizedPath(locale, secondary.href)}
            className="inline-flex items-center gap-2 rounded-[10px] border border-fd-border px-[22px] py-[13px] text-base font-semibold text-fd-foreground transition-colors hover:bg-fd-accent"
          >
            {secondary.label}
          </Link>
        </div>

        <div className="relative mx-auto mt-12 max-w-[44rem]">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-1/2 h-[120%] w-[120%] -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{ background: "var(--wash-globe)", filter: "blur(12px)" }}
          />
          <div className="relative text-left">
            <Terminal
              commands={HERO_COMMANDS}
              outputs={HERO_OUTPUTS}
              title="~/acme-shop"
              loop={false}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

export function DocsHomeBody({ children }: { children: ReactNode }): ReactNode {
  return <div className="mx-auto w-full max-w-4xl px-6 pt-4 pb-16">{children}</div>;
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
    <div className="not-prose my-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <Link
          key={card.href}
          href={localizedPath(locale, card.href)}
          className={
            card.primary
              ? "group flex flex-col gap-2 rounded-xl p-5 transition-[filter] hover:brightness-110"
              : "group flex flex-col gap-2 rounded-xl border border-fd-border bg-fd-card p-5 transition-colors hover:bg-fd-accent"
          }
          style={
            card.primary ? { background: "var(--v-purple)", color: "hsl(290 60% 98%)" } : undefined
          }
        >
          <span
            className="font-mono text-xs tracking-wide"
            style={{
              color: card.primary ? "hsl(290 60% 92%)" : "var(--color-fd-muted-foreground)",
            }}
          >
            {card.tag}
          </span>
          <span className="flex items-center gap-1 font-medium">
            {card.label}
            <span
              aria-hidden="true"
              className="transition-transform group-hover:translate-x-0.5"
              style={card.primary ? undefined : { color: "var(--v-glow)" }}
            >
              →
            </span>
          </span>
          <span
            className="text-sm leading-relaxed"
            style={{
              color: card.primary ? "hsl(290 40% 90%)" : "var(--color-fd-muted-foreground)",
            }}
          >
            {card.body}
          </span>
        </Link>
      ))}
    </div>
  );
}

type Feature = { title: string; body: string; href?: string };

export function DocsHomeFeatures({
  features,
  locale,
}: {
  features: ReadonlyArray<Feature>;
  locale?: Locale;
}): ReactNode {
  return (
    <div className="not-prose my-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
      {features.map((feature) => {
        const content = (
          <>
            <div className="font-medium text-fd-foreground">{feature.title}</div>
            <p className="mt-1 text-sm leading-relaxed text-fd-muted-foreground">{feature.body}</p>
          </>
        );
        const className =
          "block rounded-xl border border-fd-border bg-fd-card p-4 transition-colors";
        const style = { borderInlineStart: "2px solid var(--v-glow)" };
        return feature.href && locale ? (
          <Link
            key={feature.title}
            href={localizedPath(locale, feature.href)}
            className={`${className} hover:bg-fd-accent`}
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
