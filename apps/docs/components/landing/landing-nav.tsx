import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { LANDING_NAV_SECTIONS } from "@/lib/landing-sections";

export async function LandingNav(): Promise<ReactNode> {
  const t = await getTranslations("landing.nav.sections");
  return (
    <div className="vk-landing-nav">
      <nav aria-label={t("label")} className="vk-landing-nav-bar">
        <div
          data-nav-scroller=""
          className="vk-landing-nav-scroller vk-edge-fade vk-gutter vk-w-wide mx-auto"
        >
          <ul
            // biome-ignore lint/a11y/noRedundantRoles: Safari drops list semantics from a list-style: none list
            role="list"
            className="vk-landing-nav-list"
          >
            {LANDING_NAV_SECTIONS.map((id) => (
              <li key={id}>
                <a href={`#${id}`} data-nav-link="" className="vk-landing-nav-link">
                  {t(id)}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </nav>
    </div>
  );
}
