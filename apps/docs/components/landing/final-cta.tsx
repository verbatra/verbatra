import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { DRY_RUN_COMMAND } from "@/lib/install-commands";
import { CommandRow } from "./islands";

const CLOSING_HEADING_ID = "closing-heading";

export async function FinalCta(): Promise<ReactNode> {
  const t = await getTranslations("landing.closing");
  const tInstall = await getTranslations("landing.install");
  return (
    <section
      aria-labelledby={CLOSING_HEADING_ID}
      className="vk-final-cta vk-gutter vk-w-wide mx-auto w-full"
    >
      <div className="vk-closer">
        <div aria-hidden="true" className="vk-closer-grid" />
        <p className="vk-eyebrow">{t("label")}</p>
        <h2 id={CLOSING_HEADING_ID} className="vk-closer-title">
          {t("heading")}
        </h2>
        <p className="vk-lead max-w-[46ch]">{t("lead")}</p>
        <div className="vk-final-install @container">
          <CommandRow command={DRY_RUN_COMMAND} label={tInstall("copyAria")} wrap="narrow" />
        </div>
      </div>
    </section>
  );
}
