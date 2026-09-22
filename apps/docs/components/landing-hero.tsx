import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { Backdrop } from "@/components/landing/fx/backdrop";
import { GithubIcon } from "@/components/landing/github-icon";
import { GITHUB_URL } from "@/components/landing/links";
import { PackageInstall } from "@/components/landing/package-install";
import { StatusBand } from "@/components/landing/status-band";
import { Terminal } from "@/components/landing/terminal";
import Button from "@/components/ui/button";
import { type Locale, localizedPath } from "@/lib/i18n";
import { PACKAGE_VERSION } from "@/lib/site";

const CLI_COMMANDS = ["verbatra translate"] as const;

export async function LandingHero(): Promise<ReactNode> {
  const t = await getTranslations("landing.hero");
  const tTerminal = await getTranslations("landing.terminal");
  const locale = (await getLocale()) as Locale;

  const transcript = tTerminal.raw("transcript.run") as Record<string, string>;
  const runLines = Object.values(transcript);
  const outputs: Readonly<Record<number, ReadonlyArray<string>>> = { 0: runLines };

  return (
    <section className="relative overflow-hidden border-b border-fd-border">
      <Backdrop />
      <div className="vk-gutter vk-w-wide relative mx-auto pt-12 pb-16 md:pt-16">
        <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,30rem)_minmax(0,1fr)] lg:gap-14">
          <div>
            <h1
              className="max-w-[15ch] font-semibold text-[color:var(--text-strong)]"
              style={{
                fontFamily: "var(--font-display)",
                letterSpacing: "var(--tracking-tight)",
                fontSize: "var(--text-hero)",
                lineHeight: 1.02,
              }}
            >
              {t("headline")}
            </h1>
            <p className="mt-5 max-w-[48ch] text-lg leading-relaxed text-fd-muted-foreground">
              {t("lead")}
            </p>
            <div className="mt-7">
              <PackageInstall />
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3">
              <Button
                href={localizedPath(locale, "/docs/your-first-translation")}
                variant="primary"
                size="lg"
              >
                {t("ctaStart")}
              </Button>
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex min-h-11 items-center gap-2 font-medium text-[color:var(--accent)] underline decoration-[color:color-mix(in_srgb,var(--v-glow)_40%,transparent)] underline-offset-4 transition-colors hover:decoration-[color:var(--accent)]"
                data-umami-event="outbound-link"
                data-umami-event-target="github"
              >
                <GithubIcon size={16} />
                {t("ctaGithub")}
              </a>
            </div>
          </div>

          <div className="relative">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute left-1/2 top-1/2 h-[120%] w-[120%] -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{ background: "var(--wash-globe)", filter: "blur(12px)" }}
            />
            <div className="relative">
              <Terminal
                commands={CLI_COMMANDS}
                outputs={outputs}
                title="~/acme-shop"
                sessionLabel={tTerminal("sessionLabel")}
                loop={false}
                typingSpeed={32}
                initialDelay={350}
                highlight={runLines[0]}
                fitContent
              />
            </div>
            <p className="mt-3 text-[13px] text-[color:var(--text-faint)]">
              {tTerminal("caption", { version: PACKAGE_VERSION })}
            </p>
          </div>
        </div>

        <div className="mt-12 border-t border-fd-border pt-6">
          <StatusBand variant="inline" />
        </div>
      </div>
    </section>
  );
}
