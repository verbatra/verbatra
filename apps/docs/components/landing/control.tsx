import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { CONTROL_GROUPS, controlHref } from "@/lib/control-items";
import type { Locale } from "@/lib/i18n";
import { Evidence } from "./evidence";
import { Rail } from "./rail";
import { Section } from "./section";
import { SectionHead } from "./section-head";

export async function Control(): Promise<ReactNode> {
  const t = await getTranslations("landing.control");
  const locale = (await getLocale()) as Locale;

  return (
    <Section width="wide" id="control" band>
      <div>
        <SectionHead id="control-heading" title={t("heading")} lead={t("lead")} reveal />
      </div>
      <div className="vk-grid-12 vk-control-groups">
        {CONTROL_GROUPS.map((group, index) => (
          <div
            key={group.key}
            data-reveal={String(index + 2)}
            className="vk-control-group grid min-w-0 gap-y-5 border-t border-fd-border pt-6 lg:row-span-4 lg:grid-rows-subgrid lg:gap-y-6"
          >
            <h3 id={`control-${group.key}`} className="vk-h4">
              {t(`groups.${group.key}.title`)}
            </h3>
            <Rail
              labelledBy={`control-${group.key}`}
              className="lg:row-span-3 lg:grid lg:grid-rows-subgrid"
            >
              <ul
                // biome-ignore lint/a11y/noRedundantRoles: Safari drops list semantics from a list-style: none list
                role="list"
                className="vk-rail-track list-none lg:row-span-3 lg:grid-rows-subgrid"
              >
                {group.items.map((item) => (
                  <li
                    key={item.key}
                    className="vk-rail-item grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-2"
                  >
                    <span className="font-medium text-fd-foreground">
                      {t(`groups.${group.key}.items.${item.key}.title`)}
                    </span>
                    <span className="max-w-[46ch] text-sm leading-relaxed text-fd-muted-foreground">
                      {t(`groups.${group.key}.items.${item.key}.body`)}
                    </span>
                    <span className="mt-1 min-w-0">
                      <Evidence text={item.evidence} href={controlHref(locale, item)} />
                    </span>
                  </li>
                ))}
              </ul>
            </Rail>
          </div>
        ))}
      </div>
    </Section>
  );
}
