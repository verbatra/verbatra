import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import Button from "@/components/ui/button";
import { localizedPath, toLocale } from "@/lib/i18n";
import { NPM_INSTALL_COMMAND } from "@/lib/install-commands";
import { CommandRow } from "./islands";

const CLOSING_HEADING_ID = "closing-heading";

export async function FinalCta(): Promise<ReactNode> {
  const t = await getTranslations("landing.closing");
  const tInstall = await getTranslations("landing.install");
  const locale = toLocale(await getLocale());
  return (
    <section
      aria-labelledby={CLOSING_HEADING_ID}
      className="vk-final-cta vk-pad-sm vk-gutter vk-w-wide mx-auto w-full"
    >
      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6">
          <h2 id={CLOSING_HEADING_ID} className="vk-h2 max-w-[20ch]">
            {t("heading")}
          </h2>
          <p className="vk-lead max-w-[46ch]">{t("lead")}</p>
          <div className="vk-final-install @container">
            <CommandRow command={NPM_INSTALL_COMMAND} label={tInstall("copyAria")} wrap="narrow" />
          </div>
        </div>
        <div className="flex flex-wrap gap-3 lg:self-end">
          <Button href={localizedPath(locale, "/docs/quickstart")} variant="primary" size="lg">
            {t("primary")}
          </Button>
          <Button href={localizedPath(locale, "/docs")} variant="secondary" size="lg">
            {t("secondary")}
          </Button>
        </div>
      </div>
    </section>
  );
}
