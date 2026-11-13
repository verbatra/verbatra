import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { toLocale } from "@/lib/i18n";
import { DRY_RUN_COMMAND, INIT_COMMAND } from "@/lib/install-commands";
import { PROOF_IDS, proofHref, proofIsExternal } from "@/lib/landing-proof";
import { COVERAGE_THRESHOLD } from "@/lib/site";
import { CommandRow } from "./islands";

const CLOSING_HEADING_ID = "closing-heading";

export async function FinalCta(): Promise<ReactNode> {
  const t = await getTranslations("landing.closing");
  const tInstall = await getTranslations("landing.install");
  const newTab = (await getTranslations("landing.openSource"))("newTab");
  const locale = toLocale(await getLocale());
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
          <CommandRow command={INIT_COMMAND} label={tInstall("copyAria")} wrap="narrow" />
          <CommandRow
            command={DRY_RUN_COMMAND}
            label={tInstall("copyAria")}
            wrap="narrow"
            divided
          />
        </div>
        <ul aria-label={t("proof.label")} className="vk-closer-proof">
          {PROOF_IDS.map((id) => (
            <li key={id}>
              <a
                href={proofHref(id, locale)}
                className="vk-tap vk-footer-link"
                {...(proofIsExternal(id) ? { target: "_blank", rel: "noreferrer noopener" } : {})}
              >
                {t(`proof.${id}`, { threshold: COVERAGE_THRESHOLD })}
                {proofIsExternal(id) ? <span className="sr-only"> {newTab}</span> : null}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
