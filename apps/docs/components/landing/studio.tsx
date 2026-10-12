import { getLocale, getTranslations } from "next-intl/server";
import type { CSSProperties, ReactNode } from "react";
import { CommandRow, StudioScreenshot } from "@/components/landing/islands";
import { TrackedLink } from "@/components/ui/tracked-link";
import { localizedPath, toLocale } from "@/lib/i18n";
import { withInlineCode } from "@/lib/inline-code-text";
import { STUDIO_RUN_COMMAND } from "@/lib/install-commands";
import { Section } from "./section";

export const STUDIO_POINTS = ["coverage", "edit", "local"] as const;

export const STUDIO_GUIDE_PATH = "/docs/review-in-studio";

const TEXT_SPAN = { "--grid-span": 5 } as CSSProperties;
const SHOT_SPAN = { "--grid-span": 7 } as CSSProperties;

export async function Studio(): Promise<ReactNode> {
  const t = await getTranslations("landing.studio");
  const tInstall = await getTranslations("landing.install");
  const locale = toLocale(await getLocale());

  return (
    <Section width="wide" rhythm="md" id="studio">
      <div className="vk-grid-12 not-prose items-center gap-y-10">
        <div className="grid min-w-0 content-start gap-6" style={TEXT_SPAN}>
          <div>
            <h2 id="studio-heading" className="vk-h2 max-w-[15ch]">
              {t("heading")}
            </h2>
          </div>
          <p className="vk-lead max-w-[46ch]">{t("lead")}</p>
          <ul
            // biome-ignore lint/a11y/noRedundantRoles: Safari drops list semantics from a list-style: none list
            role="list"
            className="grid"
          >
            {STUDIO_POINTS.map((point) => (
              <li
                key={point}
                className="border-t py-3 text-base text-[color:var(--text-body)]"
                style={{ borderColor: "var(--border-default)" }}
              >
                {withInlineCode(t(`points.${point}`))}
              </li>
            ))}
          </ul>
          <div
            className="@container min-w-0 rounded-xl border"
            style={{ background: "var(--surface-bg)", borderColor: "var(--border-default)" }}
          >
            <CommandRow
              command={STUDIO_RUN_COMMAND}
              label={tInstall("copyCommand", { command: STUDIO_RUN_COMMAND })}
              location="studio"
              wrapsWhenNarrow
            />
          </div>
          <p className="text-sm">
            <TrackedLink
              href={localizedPath(locale, STUDIO_GUIDE_PATH)}
              className="vk-prose-link inline-flex min-h-6 items-center"
              track={{ name: "click-cta", data: { location: "studio", target: "studio-guide" } }}
            >
              {t("cta")}
            </TrackedLink>
          </p>
        </div>
        <div className="min-w-0" style={SHOT_SPAN}>
          <StudioScreenshot shot="review" alt={t("alt")} zoomOnPhone className="my-0" />
        </div>
      </div>
    </Section>
  );
}
