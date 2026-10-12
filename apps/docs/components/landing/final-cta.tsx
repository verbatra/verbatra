import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import Button from "@/components/ui/button";
import { localizedPath, toLocale } from "@/lib/i18n";
import { NPM_INSTALL_COMMAND } from "@/lib/install-commands";
import { CommandRow } from "./islands";

const CLOSE_BORDER = "color-mix(in srgb, var(--accent) 16%, var(--border-default))";

export async function FinalCta(): Promise<ReactNode> {
  const t = await getTranslations("landing.closing");
  const tInstall = await getTranslations("landing.install");
  const locale = toLocale(await getLocale());
  return (
    <section className="vk-final-cta vk-pad-sm vk-gutter vk-w-wide mx-auto w-full">
      <div
        className="grid grid-cols-[minmax(0,1fr)] gap-8 rounded-xl border px-6 py-10 md:px-12 md:py-14 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center"
        style={{ background: "var(--surface-bg)", borderColor: CLOSE_BORDER }}
      >
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6">
          <h2 className="vk-h2 max-w-[20ch]">{t("heading")}</h2>
          <p className="vk-lead max-w-[46ch]">{t("lead")}</p>
          <div className="vk-final-install @container">
            <CommandRow
              command={NPM_INSTALL_COMMAND}
              label={tInstall("copyAria")}
              location="final-cta"
              installManager="npm"
              wrap="narrow"
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-3 lg:self-end">
          <Button
            href={localizedPath(locale, "/docs/quickstart")}
            variant="primary"
            size="lg"
            track={{ name: "click-cta", data: { location: "final-cta", target: "get-started" } }}
          >
            {t("primary")}
          </Button>
          <Button
            href={localizedPath(locale, "/docs")}
            variant="secondary"
            size="lg"
            track={{ name: "click-cta", data: { location: "final-cta", target: "docs" } }}
          >
            {t("secondary")}
          </Button>
        </div>
      </div>
    </section>
  );
}
