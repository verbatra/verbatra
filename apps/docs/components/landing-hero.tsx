import { getLocale, getTranslations } from "next-intl/server";
import type { CSSProperties, ReactNode } from "react";
import { HERO_BACKGROUND, HERO_BORDER } from "@/components/landing/fx/hero-wash";
import { GithubIcon } from "@/components/landing/github-icon";
import { HeroDemo } from "@/components/landing/hero-demo";
import { HeroFacts } from "@/components/landing/hero-facts";
import { GITHUB_URL } from "@/components/landing/links";
import { PackageInstall } from "@/components/landing/package-install";
import Button from "@/components/ui/button";
import { type Locale, localizedPath } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const RISE_STEP_MS = 90;
const DEMO_HALO =
  "radial-gradient(ellipse 50% 60% at 50% 40%, color-mix(in srgb, var(--v-purple) 30%, transparent), transparent 70%)";

function Rise({
  order,
  visibleAtFirstPaint = false,
  className,
  children,
}: {
  order: number;
  visibleAtFirstPaint?: boolean;
  className?: string;
  children: ReactNode;
}): ReactNode {
  const style: CSSProperties = { animationDelay: `${order * RISE_STEP_MS}ms` };
  return (
    <div
      className={cn(visibleAtFirstPaint ? "vk-rise-settle" : "vk-rise", className)}
      style={style}
    >
      {children}
    </div>
  );
}

export async function LandingHero(): Promise<ReactNode> {
  const t = await getTranslations("landing.hero");
  const locale = (await getLocale()) as Locale;

  return (
    <section className="mx-auto w-full max-w-(--width-layout) px-2 md:px-3">
      <div
        className="relative overflow-hidden rounded-xl border"
        style={{ background: HERO_BACKGROUND, borderColor: HERO_BORDER }}
      >
        <div className="relative mx-auto flex max-w-5xl flex-col items-center px-4 pt-[72px] pb-10 text-center md:px-10 md:pt-[88px] xl:px-14">
          <Rise order={0} visibleAtFirstPaint>
            <h1 className="vk-display mx-auto max-w-[15ch]">{t("headline")}</h1>
          </Rise>
          <Rise order={1} visibleAtFirstPaint>
            <p className="vk-lead mx-auto mt-6 max-w-[52ch] max-sm:text-base">{t("lead")}</p>
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
          <Rise order={3} className="mt-8 flex w-full justify-center text-left">
            <PackageInstall />
          </Rise>
          <Rise order={4} className="relative mt-14 w-full min-w-0 max-w-3xl md:mt-16">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-[8%] -top-10 bottom-1/3"
              style={{ background: DEMO_HALO }}
            />
            <div className="relative">
              <HeroDemo
                labels={{
                  tablist: t("demo.tablistLabel"),
                  cli: t("demo.cli"),
                  studio: t("demo.studio"),
                  studioAlt: t("demo.studioAlt"),
                  session: t("demo.sessionLabel"),
                  captionCli: t("demo.caption"),
                  captionStudio: t("demo.captionStudio"),
                }}
              />
            </div>
          </Rise>
          <HeroFacts className="mt-14 w-full max-w-3xl text-center" />
        </div>
      </div>
    </section>
  );
}
