import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { CONTROL_GROUPS, controlHref } from "@/lib/control-items";
import type { Locale } from "@/lib/i18n";
import { Evidence } from "./evidence";
import { Reveal } from "./reveal";
import { Section } from "./section";
import { SectionHead } from "./section-head";

export async function Control(): Promise<ReactNode> {
  const t = await getTranslations("landing.control");
  const locale = (await getLocale()) as Locale;

  return (
    <Section width="wide" rhythm="lg" id="control">
      <Reveal>
        <SectionHead title={t("heading")} lead={t("lead")} />
      </Reveal>
      <Reveal order={1} className="mt-12 grid gap-x-12 gap-y-14 lg:grid-cols-3">
        {CONTROL_GROUPS.map((group) => (
          <section
            key={group.key}
            aria-labelledby={`control-${group.key}`}
            className="min-w-0 border-t border-fd-border pt-6"
          >
            <h3 id={`control-${group.key}`} className="vk-h4">
              {t(`groups.${group.key}.title`)}
            </h3>
            <ul className="mt-6 grid list-none gap-7 p-0">
              {group.items.map((item) => (
                <li key={item.key} className="grid gap-2">
                  <span className="font-medium text-fd-foreground">
                    {t(`groups.${group.key}.items.${item.key}.title`)}
                  </span>
                  <span className="max-w-[46ch] text-[15px] leading-relaxed text-fd-muted-foreground">
                    {t(`groups.${group.key}.items.${item.key}.body`)}
                  </span>
                  <span className="mt-1">
                    <Evidence text={item.evidence} href={controlHref(locale, item)} />
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </Reveal>
    </Section>
  );
}
