import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { IntentPrefetchLink } from "@/components/ui/intent-prefetch-link";
import { localizedPath, toLocale } from "@/lib/i18n";
import { LANDING_FEATURES, type LandingFeatureId } from "@/lib/landing-features";
import { PlainList } from "./plain-list";
import { Section } from "./section";
import { SectionHead } from "./section-head";

const FEATURES_HEADING_ID = "features-heading";

const DIM = "vk-feature-dim";
const LIT = "vk-feature-lit";

function StudioVisual(): ReactNode {
  return (
    <>
      <rect x="20" y="16" width="180" height="88" rx="10" className={DIM} />
      <path d="M20 36h180M36 54h70M36 70h50M36 86h60" className={DIM} />
      <path d="M124 54h56M124 70h40" className={LIT} />
      <circle cx="168" cy="86" r="7" className={LIT} />
      <path d="M164.5 86l2.5 2.5 4-4.5" className={LIT} />
    </>
  );
}

function HandoffVisual(): ReactNode {
  return (
    <>
      <rect x="22" y="28" width="56" height="64" rx="8" className={DIM} />
      <path d="M34 46h32M34 60h32M34 74h20" className={DIM} />
      <path d="M88 48h44M124 40l8 8-8 8M132 74h-44M96 66l-8 8 8 8" className={LIT} />
      <rect x="142" y="28" width="56" height="64" rx="8" className={LIT} />
      <path d="M142 50h56M142 70h56M170 28v64" className={LIT} />
    </>
  );
}

function ExtractVisual(): ReactNode {
  return (
    <>
      <path d="M30 30h50M30 46h70M30 62h40" className={DIM} />
      <path d="M30 78h60M112 60h30M134 52l8 8-8 8" className={LIT} />
      <rect x="154" y="40" width="44" height="40" rx="8" className={LIT} />
      <path d="M166 56h20M166 66h12" className={LIT} />
    </>
  );
}

function WatchVisual(): ReactNode {
  return (
    <>
      <circle cx="110" cy="60" r="38" className={DIM} />
      <path d="M110 22a38 38 0 0 1 36 26M146 36v12h-12M110 60V40M110 60l14 8" className={LIT} />
    </>
  );
}

function TypesVisual(): ReactNode {
  return (
    <>
      <path d="M24 42h44M24 58h60M24 74h36" className={DIM} />
      <path
        d="M98 58h22M136 30l-10 30 10 30M184 30l10 30-10 30M150 50h20M150 66h20"
        className={LIT}
      />
    </>
  );
}

function DoctorVisual(): ReactNode {
  return (
    <>
      <path d="M30 60h160M50 30v12M110 30v12M170 30v12" className={DIM} strokeDasharray="2 8" />
      <circle cx="50" cy="60" r="10" className={LIT} />
      <circle cx="110" cy="60" r="10" className={LIT} />
      <circle cx="170" cy="60" r="10" className={LIT} />
      <path d="M45 60l3.5 3.5 6-7M105 60l3.5 3.5 6-7M165 60l3.5 3.5 6-7" className={LIT} />
    </>
  );
}

const FEATURE_VISUALS: Readonly<Record<LandingFeatureId, () => ReactNode>> = {
  studio: StudioVisual,
  handoff: HandoffVisual,
  extract: ExtractVisual,
  watch: WatchVisual,
  types: TypesVisual,
  doctor: DoctorVisual,
};

export async function Features(): Promise<ReactNode> {
  const t = await getTranslations("landing.features");
  const locale = toLocale(await getLocale());
  return (
    <Section id="features" labelledBy={FEATURES_HEADING_ID}>
      <p className="vk-eyebrow">{t("label")}</p>
      <SectionHead id={FEATURES_HEADING_ID} title={t("heading")} lead={t("lead")} align="start" />
      <PlainList className="vk-feature-grid">
        {LANDING_FEATURES.map(({ id, docsPath }) => {
          const Visual = FEATURE_VISUALS[id];
          return (
            <li key={id} className="vk-feature">
              <div className="vk-feature-visual">
                <svg
                  viewBox="0 0 220 120"
                  className="vk-feature-art"
                  aria-hidden="true"
                  focusable="false"
                >
                  <Visual />
                </svg>
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
