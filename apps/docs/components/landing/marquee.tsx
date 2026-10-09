import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { StackIcon, type StackIconKey, StackIconSprite } from "@/components/stack-icons";
import { TrackedLink } from "@/components/ui/tracked-link";
import { type Locale, localizedPath } from "@/lib/i18n";
import { FORMAT_DISPLAY, SUPPORTED_FORMAT_IDS } from "@/lib/landing-facts";
import { STACK_FRAMEWORKS } from "@/lib/stack-formats";
import { MarqueeToggle } from "./marquee-toggle";

const ICON = 20;
const ICON_PREFIX = "vk-marquee-icon";

export const MARQUEE_FRAMEWORKS = STACK_FRAMEWORKS;

const ROWS = ["frameworks", "formats"] as const;

type RowId = (typeof ROWS)[number];

const ROW_PAGES: Readonly<Record<RowId, string>> = {
  frameworks: "/docs/pick-your-stack",
  formats: "/docs/formats",
};

type TrackItem = { key: string; name: string; icon: StackIconKey; tip: string };

function IconSprite(): ReactNode {
  return (
    <StackIconSprite
      prefix={ICON_PREFIX}
      icons={[
        ...MARQUEE_FRAMEWORKS.map((item) => item.icon),
        ...Object.values(FORMAT_DISPLAY).map((item) => item.icon),
      ]}
    />
  );
}

function Track({
  items,
  label,
  hidden = false,
}: {
  items: ReadonlyArray<TrackItem>;
  label: string;
  hidden?: boolean;
}): ReactNode {
  return (
    <ul
      className="vk-track"
      aria-label={hidden ? undefined : label}
      aria-hidden={hidden || undefined}
    >
      {items.map((item) => (
        <li key={item.key} className="inline-flex whitespace-nowrap">
          <span
            data-tip={item.tip}
            className="vk-tip vk-marquee-item inline-flex items-center px-1 font-medium text-fd-muted-foreground"
            style={{ fontFamily: "var(--font-display)" }}
          >
            <span className="shrink-0 text-fd-foreground opacity-85">
              <StackIcon
                prefix={ICON_PREFIX}
                icon={item.icon}
                size={ICON}
                className="vk-marquee-icon"
              />
            </span>
            <span>{item.name}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function Row({
  items,
  label,
  direction,
}: {
  items: ReadonlyArray<TrackItem>;
  label: string;
  direction: "left" | "right";
}): ReactNode {
  return (
    <div className="vk-marquee" data-direction={direction}>
      <Track items={items} label={label} />
      <Track items={items} label={label} hidden />
    </div>
  );
}

export async function Marquee(): Promise<ReactNode> {
  const t = await getTranslations("landing.marquee");
  const locale = (await getLocale()) as Locale;
  const frameworks: ReadonlyArray<TrackItem> = MARQUEE_FRAMEWORKS.map(({ key, name, icon }) => ({
    key,
    name,
    icon,
    tip: t(`frameworks.${key}`),
  }));
  const formats: ReadonlyArray<TrackItem> = SUPPORTED_FORMAT_IDS.map((id) => ({
    key: id,
    name: FORMAT_DISPLAY[id].label,
    icon: FORMAT_DISPLAY[id].icon,
    tip: t("formatTip", { id }),
  }));

  return (
    <section
      aria-label={t("label")}
      className="vk-marquee-band"
      id="marquee"
      data-presence="marquee"
    >
      <IconSprite />
      <div className="vk-marquee-head vk-gutter vk-w-wide mx-auto">
        <p className="vk-marquee-intro text-fd-muted-foreground">{t("intro")}</p>
        <MarqueeToggle label={t("pause")} />
        <ul
          // biome-ignore lint/a11y/noRedundantRoles: Safari drops list semantics from a list-style: none list
          role="list"
          className="vk-marquee-links"
        >
          {ROWS.map((row) => (
            <li key={row}>
              <TrackedLink
                href={localizedPath(locale, ROW_PAGES[row])}
                track={{ name: "click-cta", data: { location: "marquee", target: row } }}
                className="vk-prose-link"
              >
                {t(`${row}Link`)}
              </TrackedLink>
            </li>
          ))}
        </ul>
      </div>
      <div className="vk-marquee-rows">
        <Row items={frameworks} label={t("frameworksLabel")} direction="left" />
        <Row items={formats} label={t("formatsLabel")} direction="right" />
      </div>
    </section>
  );
}
