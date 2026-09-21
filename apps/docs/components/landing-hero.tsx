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

const CLI_COMMANDS = [
  "verbatra init",
  "verbatra translate",
  "verbatra diff",
  "verbatra watch",
] as const;

const TRANSCRIPT_KEYS = ["init", "translate", "diff", "watch"] as const;

export async function LandingHero(): Promise<ReactNode> {
  const t = await getTranslations("landing.hero");
  const tTerminal = await getTranslations("landing.terminal");
  const locale = (await getLocale()) as Locale;

  const transcript = tTerminal.raw("transcript") as Record<string, Record<string, string>>;
  const outputs: Readonly<Record<number, ReadonlyArray<string>>> = Object.fromEntries(
    TRANSCRIPT_KEYS.map((key, index) => [index, Object.values(transcript[key] ?? {})]),
  );

  return (
    <section className="relative overflow-hidden border-b border-fd-border">
      <Backdrop />
      <div className="vk-gutter vk-w-wide relative mx-auto pt-12 pb-20 md:pt-14">
        <div className="vk-w-hero mx-auto text-center">
          <h1
            className="mx-auto max-w-[16ch] font-semibold"
            style={{
              fontFamily: "var(--font-display)",
              letterSpacing: "var(--tracking-tight)",
              fontSize: "var(--text-hero)",
              lineHeight: 1.04,
              textWrap: "balance",
              background: "var(--gradient-headline)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            {t("headline")}
          </h1>
          <p className="mx-auto mt-4 max-w-[46ch] text-lg leading-relaxed text-fd-muted-foreground">
            {t("lead")}
          </p>
          <div className="mt-6 flex justify-center">
            <PackageInstall />
          </div>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            <Button
              href={localizedPath(locale, "/docs/your-first-translation")}
              variant="primary"
              size="lg"
              trailingArrow
            >
              {t("ctaQuickstart")}
            </Button>
            <Button href={GITHUB_URL} variant="secondary" size="lg">
              <GithubIcon size={18} />
              {t("ctaGithub")}
            </Button>
          </div>
          <div className="mt-5">
            <StatusBand variant="inline" />
          </div>
        </div>

        <div className="vk-w-content relative mx-auto mt-10">
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
            />
          </div>
          <p className="mt-3 text-center text-[13px] text-[color:var(--text-faint)]">
            {tTerminal("caption", { version: PACKAGE_VERSION })}
          </p>
        </div>
      </div>
    </section>
  );
}
