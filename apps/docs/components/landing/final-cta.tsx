import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import Button, { buttonClasses } from "@/components/ui/button";
import { localizedPath, toLocale } from "@/lib/i18n";
import { NPM_INSTALL_COMMAND } from "@/lib/install-commands";
import { CommandRow } from "./islands";
import { GITHUB_URL } from "./links";

const CLOSING_HEADING_ID = "closing-heading";

export async function FinalCta(): Promise<ReactNode> {
  const t = await getTranslations("landing.closing");
  const tInstall = await getTranslations("landing.install");
  const tOpen = await getTranslations("landing.openSource");
  const locale = toLocale(await getLocale());
  return (
    <section
      aria-labelledby={CLOSING_HEADING_ID}
      className="vk-final-cta vk-gutter vk-w-wide mx-auto w-full"
    >
      <div className="vk-closer">
        <h2 id={CLOSING_HEADING_ID} className="vk-h2 max-w-[20ch]">
          {t("heading")}
        </h2>
        <p className="vk-lead max-w-[46ch]">{t("lead")}</p>
        <div className="vk-final-install @container">
          <CommandRow command={NPM_INSTALL_COMMAND} label={tInstall("copyAria")} wrap="narrow" />
        </div>
        <div className="vk-closer-actions">
          <Button href={localizedPath(locale, "/docs/quickstart")} variant="primary" size="lg">
            {t("primary")}
          </Button>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer noopener"
            className={buttonClasses("secondary", "lg")}
          >
            {t("secondary")}
            <span className="sr-only"> {tOpen("newTab")}</span>
          </a>
        </div>
      </div>
    </section>
  );
}
