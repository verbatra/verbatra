import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import CommandLine from "@/components/ui/command-line";
import { type Locale, localizedPath } from "@/lib/i18n";
import { Backdrop } from "./fx/backdrop";
import { NPM_CLI } from "./links";
import { SectionHead } from "./section-head";

const INSTALL_COMMAND = "npm i -D @verbatra/cli";
const CLI_TOKEN = "@verbatra/cli";

export async function FinalCta(): Promise<ReactNode> {
  const t = await getTranslations("landing.finalClose");
  const tFaq = await getTranslations("landing.faq");
  const locale = (await getLocale()) as Locale;
  return (
    <section className="vk-rhythm-lg vk-pad-lg relative overflow-hidden border-t border-fd-border">
      <Backdrop
        gridFade="radial-gradient(ellipse 60% 90% at 50% 50%, #000 30%, transparent 75%)"
        beams={false}
        spotlightFill="var(--v-purple)"
        sparkleDensity={0.00012}
      />
      <div className="vk-gutter vk-w-hero relative mx-auto text-center">
        <SectionHead align="center" maxWidth="640px" title={t("heading")} lead={t("lead")} />
        <div className="mt-8 flex justify-center">
          <CommandLine command={INSTALL_COMMAND} link={{ token: CLI_TOKEN, href: NPM_CLI }} />
        </div>
        <a
          href={localizedPath(locale, "/docs")}
          className="mt-6 inline-flex min-h-11 items-center gap-2 font-medium text-[color:var(--accent)] underline decoration-[color:color-mix(in_srgb,var(--v-glow)_40%,transparent)] underline-offset-4 transition-colors hover:decoration-[color:var(--accent)]"
        >
          {tFaq("ctaDocs")}
          <span aria-hidden="true">→</span>
        </a>
      </div>
    </section>
  );
}
