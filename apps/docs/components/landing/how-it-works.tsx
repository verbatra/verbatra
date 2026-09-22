import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { Section } from "./section";
import { SectionHead } from "./section-head";

type Step = { title: string; body: string };

export async function HowItWorks(): Promise<ReactNode> {
  const t = await getTranslations("landing.how");
  const steps = Object.values(t.raw("steps") as Record<string, Step>);
  return (
    <Section width="wide">
      <SectionHead title={t("heading")} lead={t("lead")} />
      <ol className="vk-w-content relative mt-12 list-none">
        <span
          aria-hidden="true"
          className="absolute top-2 bottom-8 w-px"
          style={{
            left: "19px",
            background:
              "linear-gradient(to bottom, var(--v-glow), color-mix(in srgb, var(--v-glow) 10%, transparent))",
          }}
        />
        {steps.map((step, i) => (
          <li key={step.title} className="relative grid grid-cols-[40px_1fr] gap-6 pb-9 last:pb-0">
            <span
              className="flex h-10 w-10 items-center justify-center rounded-full font-mono text-sm"
              style={{
                color: "var(--v-glow)",
                background: "var(--surface-bg)",
                border: "1px solid color-mix(in srgb, var(--v-glow) 45%, var(--border-default))",
                boxShadow: "0 0 0 4px var(--surface-bg), 0 0 16px -4px var(--v-glow)",
              }}
            >
              {String(i + 1).padStart(2, "0")}
            </span>
            <div className="pt-1.5">
              <h3
                className="mb-2 font-semibold text-fd-foreground"
                style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-h3)" }}
              >
                {step.title}
              </h3>
              <p className="text-sm leading-relaxed text-fd-muted-foreground">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </Section>
  );
}
