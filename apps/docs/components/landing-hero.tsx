import { getLocale, getTranslations } from "next-intl/server";
import type { CSSProperties, ReactNode } from "react";
import { GithubIcon } from "@/components/landing/github-icon";
import { GITHUB_URL } from "@/components/landing/links";
import { PackageInstall } from "@/components/landing/package-install";
import Button from "@/components/ui/button";
import { type Locale, localizedPath } from "@/lib/i18n";
import { FORMAT_COUNT, PROVIDER_COUNT } from "@/lib/landing-facts";
import { PACKAGE_VERSION } from "@/lib/site";
import { cn } from "@/lib/utils";

const HERO_BACKGROUND = [
  "radial-gradient(ellipse 72% 62% at 50% -4%, color-mix(in srgb, var(--v-purple) 58%, transparent), transparent 70%)",
  "radial-gradient(ellipse 46% 40% at 12% 104%, color-mix(in srgb, var(--v-violet) 26%, transparent), transparent 70%)",
  "var(--surface-bg)",
].join(", ");

const HERO_BORDER = "color-mix(in srgb, var(--v-glow) 16%, var(--border-default))";

const RISE_STEP_MS = 90;

function Rise({
  order,
  className,
  children,
}: {
  order: number;
  className?: string;
  children: ReactNode;
}): ReactNode {
  const style: CSSProperties = { animationDelay: `${order * RISE_STEP_MS}ms` };
  return (
    <div className={cn("vk-rise", className)} style={style}>
      {children}
    </div>
  );
}

type Fact = { key: "release" | "formats" | "providers" | "license"; value: string };

const FACTS: ReadonlyArray<Fact> = [
  { key: "release", value: `@verbatra/cli ${PACKAGE_VERSION}` },
  { key: "formats", value: String(FORMAT_COUNT) },
  { key: "providers", value: String(PROVIDER_COUNT) },
  { key: "license", value: "MIT" },
];

export async function LandingHero(): Promise<ReactNode> {
  const t = await getTranslations("landing.hero");
  const locale = (await getLocale()) as Locale;

  return (
    <section className="px-2 md:px-3">
      <div
        className="relative overflow-hidden rounded-xl border"
        style={{ background: HERO_BACKGROUND, borderColor: HERO_BORDER }}
      >
        <div className="relative grid grid-cols-[minmax(0,1fr)] justify-items-center px-4 pt-[76px] pb-10 text-center md:px-10 md:pt-32 md:pb-11">
          <Rise order={0}>
            <h1
              className="max-w-[10ch] font-semibold text-[color:var(--text-strong)]"
              style={{
                fontFamily: "var(--font-display)",
                letterSpacing: "-0.03em",
                fontSize: "var(--text-hero)",
                lineHeight: 0.96,
                textWrap: "balance",
              }}
            >
              {t("headline")}
            </h1>
          </Rise>
          <Rise order={1}>
            <p className="mt-6 max-w-[54ch] text-[17px] leading-relaxed text-fd-muted-foreground md:text-[19px]">
              {t("lead")}
            </p>
          </Rise>
          <Rise
            order={2}
            className="mt-9 flex flex-wrap items-center justify-center gap-x-7 gap-y-3"
          >
            <Button
              href={localizedPath(locale, "/docs/your-first-translation")}
              variant="primary"
              size="lg"
              className="shadow-[0_10px_34px_-12px_color-mix(in_srgb,var(--v-purple)_85%,transparent)]"
            >
              {t("ctaStart")}
            </Button>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex min-h-11 items-center gap-2 font-medium text-fd-foreground transition-colors hover:text-[color:var(--accent)]"
              data-umami-event="outbound-link"
              data-umami-event-target="github"
            >
              <GithubIcon size={16} />
              {t("ctaGithub")}
            </a>
          </Rise>
          <Rise order={3} className="mt-11 flex w-full justify-center text-left">
            <PackageInstall />
          </Rise>
          <Rise order={4} className="w-full">
            <dl
              className="mt-[72px] grid grid-cols-2 gap-x-6 gap-y-[18px] pt-[22px] text-left text-sm md:grid-cols-4"
              style={{
                borderTop: "1px solid color-mix(in srgb, var(--border-default) 70%, transparent)",
              }}
            >
              {FACTS.map((fact) => (
                <div key={fact.key}>
                  <dt className="text-[color:var(--text-faint)]">{t(`facts.${fact.key}`)}</dt>
                  <dd className="mt-0.5 font-medium text-fd-foreground tabular-nums">
                    {fact.value}
                  </dd>
                </div>
              ))}
            </dl>
          </Rise>
        </div>
      </div>
    </section>
  );
}
