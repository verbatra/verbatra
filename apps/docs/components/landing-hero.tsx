import { getLocale, getTranslations } from "next-intl/server";
import type { CSSProperties, ReactNode } from "react";
import { HERO_BACKGROUND, HERO_BORDER } from "@/components/landing/fx/hero-wash";
import { GithubIcon } from "@/components/landing/github-icon";
import { HeroFacts } from "@/components/landing/hero-facts";
import { GITHUB_URL } from "@/components/landing/links";
import { PackageInstall } from "@/components/landing/package-install";
import Button from "@/components/ui/button";
import { type Locale, localizedPath } from "@/lib/i18n";
import { cn } from "@/lib/utils";

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
            <HeroFacts className="mt-[72px]" />
          </Rise>
        </div>
      </div>
    </section>
  );
}
