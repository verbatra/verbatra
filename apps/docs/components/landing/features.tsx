import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { CardSpotlight } from "./card-spotlight";
import { Section } from "./section";
import { SectionHead } from "./section-head";

type Reason = { title: string; body: string };

const REASON_KEYS = [
  "incremental",
  "provider",
  "safety",
  "environment",
  "oneEngine",
  "dryRun",
] as const;

export async function Features(): Promise<ReactNode> {
  const t = await getTranslations("landing.why");
  const reasons = t.raw("reasons") as Record<string, Reason>;
  return (
    <Section width="wide">
      <SectionHead title={t("heading")} lead={t("lead")} />
      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {REASON_KEYS.map((key) => {
          const reason = reasons[key];
          if (!reason) return null;
          return (
            <CardSpotlight key={key}>
              <div className="flex h-full flex-col gap-2 p-6">
                <h3
                  className="font-semibold text-fd-foreground"
                  style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-h3)" }}
                >
                  {reason.title}
                </h3>
                <p className="text-sm leading-relaxed text-fd-muted-foreground">{reason.body}</p>
              </div>
            </CardSpotlight>
          );
        })}
      </div>
    </Section>
  );
}
