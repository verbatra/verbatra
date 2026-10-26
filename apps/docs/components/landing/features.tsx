import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { IntentPrefetchLink } from "@/components/ui/intent-prefetch-link";
import { localizedPath, toLocale } from "@/lib/i18n";
import { LANDING_FEATURES } from "@/lib/landing-features";
import { FeatureCanvas } from "./feature-canvas";
import { PlainList } from "./plain-list";
import { Section } from "./section";
import { SectionHead } from "./section-head";

const FEATURES_HEADING_ID = "features-heading";

const PHASE_STEP = 1.3;

export async function Features(): Promise<ReactNode> {
  const t = await getTranslations("landing.features");
  const locale = toLocale(await getLocale());
  return (
    <Section id="features" labelledBy={FEATURES_HEADING_ID}>
      <p className="vk-eyebrow">{t("label")}</p>
      <SectionHead id={FEATURES_HEADING_ID} title={t("heading")} lead={t("lead")} align="start" />
      <PlainList className="vk-feature-grid">
        {LANDING_FEATURES.map(({ id, docsPath }, index) => {
          return (
            <li key={id} className="vk-feature">
              <div className="vk-feature-visual">
                <FeatureCanvas id={id} phase={index * PHASE_STEP} />
              </div>
              <div className="vk-feature-text">
                <h3 className="vk-feature-title">
                  <IntentPrefetchLink
                    href={localizedPath(locale, docsPath)}
                    className="vk-feature-link"
                  >
                    {t(`items.${id}.title`)}
                  </IntentPrefetchLink>
                </h3>
                <p className="vk-feature-body">{t(`items.${id}.body`)}</p>
              </div>
            </li>
          );
        })}
      </PlainList>
    </Section>
  );
}
