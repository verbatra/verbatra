import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { StackIcon, type StackIconKey, StackIconSprite } from "@/components/stack-icons";
import { TrackedLink } from "@/components/ui/tracked-link";
import { type Locale, localizedPath } from "@/lib/i18n";
import { FORMAT_DISPLAY, SUPPORTED_FORMAT_IDS } from "@/lib/landing-facts";
import { STACK_FRAMEWORKS } from "@/lib/stack-formats";
import { MarqueeRow } from "./marquee-row";
import { MarqueeToggle } from "./marquee-toggle";

const ICON = 20;
const ICON_PREFIX = "vk-marquee-icon";

export const MARQUEE_FRAMEWORKS = STACK_FRAMEWORKS;

type RowId = "frameworks" | "formats";

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
  row,
  items,
  href,
  label,
  hidden = false,
}: {
  row: RowId;
  items: ReadonlyArray<TrackItem>;
  href: string;
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
          <TrackedLink
            href={href}
            data-tip={item.tip}
            track={{ name: "click-cta", data: { location: "marquee", target: row } }}
            tabIndex={hidden ? -1 : undefined}
            className="vk-tip vk-marquee-item inline-flex items-center px-1 font-medium text-fd-muted-foreground transition-colors hover:text-fd-foreground focus-visible:text-fd-foreground"
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
          </TrackedLink>
        </li>
      ))}
    </ul>
  );
}

function Row({
  row,
  items,
  href,
  label,
  direction,
}: {
  row: RowId;
  items: ReadonlyArray<TrackItem>;
  href: string;
  label: string;
  direction: "left" | "right";
}): ReactNode {
  return (
    <MarqueeRow direction={direction}>
      <Track row={row} items={items} href={href} label={label} />
      <Track row={row} items={items} href={href} label={label} hidden />
    </MarqueeRow>
  );
}

export async function Marquee(): Promise<ReactNode> {
  const t = await getTranslations("landing.marquee");
  const locale = (await getLocale()) as Locale;
  const formatsHref = localizedPath(locale, "/docs/formats");

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
      <div className="vk-marquee-head">
        <p className="vk-marquee-intro text-center text-fd-muted-foreground">{t("intro")}</p>
        <MarqueeToggle label={t("pause")} />
      </div>
      <div className="vk-marquee-rows">
        <Row
          row="frameworks"
          items={frameworks}
          href={formatsHref}
          label={t("frameworksLabel")}
          direction="left"
        />
        <Row
          row="formats"
          items={formats}
          href={formatsHref}
          label={t("formatsLabel")}
          direction="right"
        />
      </div>
    </section>
  );
}
