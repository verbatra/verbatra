import { getLocale, getTranslations } from "next-intl/server";
import type { CSSProperties, ReactNode } from "react";
import { PromptCopyButton } from "@/components/ai-setup-prompt";
import { CommandRow } from "@/components/command-row";
import { HeroDemo } from "@/components/landing/hero-demo";
import { HeroFacts } from "@/components/landing/hero-facts";
import { NPM_CLI } from "@/components/landing/links";
import Button from "@/components/ui/button";
import { type Locale, localizedPath } from "@/lib/i18n";
import { CLI_PACKAGE, NPM_INSTALL_COMMAND } from "@/lib/install-commands";
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
  const tInstall = await getTranslations("landing.install");
  const locale = (await getLocale()) as Locale;

  return (
    <section className="mx-auto w-full max-w-(--width-layout) px-2 pt-2 md:px-3 md:pt-3">
      <div className="vk-hero-surface">
        <div aria-hidden="true" className="vk-hero-wash" />
        <div className="vk-hero-grid mx-auto px-4 pt-14 pb-8 text-center sm:px-8 md:pt-16 md:pb-10 xl:px-14">
          <div className="vk-hero-head">
            <Rise order={0} visibleAtFirstPaint>
              <h1 className="vk-hero-title mx-auto max-w-[13ch]">{t("headline")}</h1>
            </Rise>
            <Rise order={1} visibleAtFirstPaint>
              <p className="vk-lead vk-hero-lead mx-auto mt-6 max-w-[48ch]">{t("lead")}</p>
            </Rise>
          </div>
          <Rise order={2} className="vk-hero-actions">
            <div className="vk-hero-cta-row grid gap-3 sm:grid-cols-2">
              <Button
                href={localizedPath(locale, "/docs/quickstart")}
                variant="primary"
                size="lg"
                className="vk-hero-cta justify-center"
              >
                {t("ctaStart")}
              </Button>
              <PromptCopyButton className="w-full" />
            </div>
            <div
              className="vk-hero-command not-prose @container mt-5 text-left"
              data-hero-part="command"
            >
              <CommandRow
                command={NPM_INSTALL_COMMAND}
                link={{ token: CLI_PACKAGE, href: NPM_CLI }}
                label={tInstall("copyAria")}
                event="copy-install-command"
                wrapsWhenNarrow
              />
            </div>
          </Rise>
          <Rise order={3} className="vk-hero-facts">
            <HeroFacts />
          </Rise>
        </div>
      </div>
      <Rise order={4} className="relative mx-auto mt-10 w-full min-w-0 max-w-3xl px-2 md:mt-12">
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
    </section>
  );
}
