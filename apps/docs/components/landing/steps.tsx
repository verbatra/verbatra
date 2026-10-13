import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { withInlineCode } from "@/lib/inline-code-text";
import { LANDING_STEP_CODE, LANDING_STEP_IDS } from "@/lib/landing-code";
import { CodeFrame } from "./code-frame";
import { Section } from "./section";
import { SectionHead } from "./section-head";

export async function Steps(): Promise<ReactNode> {
  const t = await getTranslations("landing.steps");
  const code = await getTranslations("landing.code");
  const frames = await Promise.all(
    LANDING_STEP_IDS.map((id) =>
      CodeFrame({
        code: LANDING_STEP_CODE[id].code,
        lang: LANDING_STEP_CODE[id].language,
        copy: { label: code("copy") },
      }),
    ),
  );
  return (
    <Section id="how-it-works" band>
      <SectionHead id="how-it-works-heading" title={t("heading")} lead={t("lead")} />
      <ol
        // biome-ignore lint/a11y/noRedundantRoles: Safari drops list semantics from a list-style: none list
        role="list"
        data-reveal="2"
        className="mt-10 grid list-none gap-10 lg:mt-14 lg:grid-cols-3 lg:gap-x-6 lg:gap-y-4"
      >
        {LANDING_STEP_IDS.map((id, index) => (
          <li
            key={id}
            data-step={id}
            className="grid min-w-0 content-start gap-3 border-t border-fd-border pt-5 lg:row-span-3 lg:grid-rows-subgrid lg:gap-3"
          >
            <h3 className="vk-h4">{t(`items.${id}.title`)}</h3>
            <p className="max-w-[46ch] text-sm leading-relaxed text-(--text-muted)">
              {withInlineCode(t(`items.${id}.body`))}
            </p>
            <div className="min-w-0 self-start pt-2">{frames[index]}</div>
          </li>
        ))}
      </ol>
    </Section>
  );
}
