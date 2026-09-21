import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { FeatureCard } from "./feature-card";
import {
  AiTranslationSkeleton,
  AutomationSkeleton,
  ExcelHandoffSkeleton,
} from "./pillar-skeletons";
import { Section } from "./section";
import { SectionHead } from "./section-head";

type Pillar = { key: string; visual: ReactNode };

const PILLARS: ReadonlyArray<Pillar> = [
  { key: "ai", visual: <AiTranslationSkeleton /> },
  { key: "excel", visual: <ExcelHandoffSkeleton /> },
  { key: "automation", visual: <AutomationSkeleton /> },
];

export async function Pillars(): Promise<ReactNode> {
  const t = await getTranslations("landing.pillars");
  return (
    <Section width="wide">
      <SectionHead align="center" maxWidth="620px" title={t("heading")} lead={t("lead")} />
      <div className="mt-12 grid gap-4 md:grid-cols-3">
        {PILLARS.map((pillar) => (
          <FeatureCard
            key={pillar.key}
            title={t(`${pillar.key}.title`)}
            body={t(`${pillar.key}.body`)}
            visual={pillar.visual}
          />
        ))}
      </div>
    </Section>
  );
}
