import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { CommandRow } from "@/components/command-row";
import Button from "@/components/ui/button";
import { type Locale, localizedPath } from "@/lib/i18n";
import { NPM_INSTALL_COMMAND } from "@/lib/install-commands";

const CLOSE_BORDER = "color-mix(in srgb, var(--v-glow) 16%, var(--border-default))";

export async function FinalCta(): Promise<ReactNode> {
  const t = await getTranslations("landing.finalClose");
  const tInstall = await getTranslations("landing.install");
  const locale = (await getLocale()) as Locale;
  return (
    <section
      data-presence="final-cta"
      className="vk-pad-top-sm vk-gutter vk-w-wide mx-auto w-full pb-3"
    >
      <div
        className="grid grid-cols-[minmax(0,1fr)] gap-8 rounded-xl border px-6 py-10 md:px-12 md:py-14 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center"
        style={{ background: "var(--surface-bg)", borderColor: CLOSE_BORDER }}
      >
        <div data-reveal="0" className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6">
          <h2 className="vk-h2 max-w-[20ch]">{t("heading")}</h2>
          <div className="vk-final-install @container">
            <p className="vk-final-install-hint">{t("installHint")}</p>
            <CommandRow
              command={NPM_INSTALL_COMMAND}
              label={tInstall("copyAria")}
              location="final-cta"
              installManager="npm"
              wrapsWhenNarrow
            />
          </div>
        </div>
        <div data-reveal="1" className="flex flex-wrap gap-3 lg:self-end">
          <Button
            href={localizedPath(locale, "/docs/quickstart")}
            variant="primary"
            size="lg"
            track={{ name: "click-cta", data: { location: "final-cta", target: "get-started" } }}
          >
            {t("start")}
          </Button>
          <Button
            href={localizedPath(locale, "/docs")}
            variant="secondary"
            size="lg"
            track={{ name: "click-cta", data: { location: "final-cta", target: "docs" } }}
          >
            {t("docs")}
          </Button>
        </div>
      </div>
    </section>
  );
}
