import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { CONTROL_GROUPS, controlHref } from "@/lib/control-items";
import type { Locale } from "@/lib/i18n";
import { Evidence } from "./evidence";
import { Section } from "./section";
import { SectionHead } from "./section-head";

export async function Control(): Promise<ReactNode> {
  const t = await getTranslations("landing.control");
  const locale = (await getLocale()) as Locale;

  return (
    <Section width="wide" rhythm="lg" id="control">
      <div>
        <SectionHead title={t("heading")} lead={t("lead")} />
      </div>
      <div className="mt-12 grid gap-x-12 gap-y-14 lg:grid-cols-3 lg:grid-rows-[repeat(4,auto)] lg:gap-y-7">
        {CONTROL_GROUPS.map((group) => (
          <section
            key={group.key}
            aria-labelledby={`control-${group.key}`}
            className="grid min-w-0 gap-y-6 border-t border-fd-border pt-6 lg:row-span-4 lg:grid-rows-subgrid"
          >
            <h3 id={`control-${group.key}`} className="vk-h4">
              {t(`groups.${group.key}.title`)}
            </h3>
            <ul className="grid list-none gap-7 p-0 lg:row-span-3 lg:grid-rows-subgrid">
              {group.items.map((item) => (
                <li key={item.key} className="grid content-start gap-2">
                  <span className="font-medium text-fd-foreground">
                    {t(`groups.${group.key}.items.${item.key}.title`)}
                  </span>
                  <span className="max-w-[46ch] text-sm leading-relaxed text-fd-muted-foreground">
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
      </div>
    </Section>
  );
}
