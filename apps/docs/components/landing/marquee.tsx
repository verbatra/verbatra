import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { StackIcon, type StackIconKey, StackIconSprite } from "@/components/stack-icons";
import { type Locale, localizedPath } from "@/lib/i18n";
import { FORMAT_DISPLAY, SUPPORTED_FORMAT_IDS } from "@/lib/landing-facts";
import { MarqueeRow } from "./marquee-row";

const ICON = 20;
const ICON_PREFIX = "vk-marquee-icon";

export const MARQUEE_FRAMEWORKS = [
  { key: "react", name: "React", icon: "react" },
  { key: "next", name: "Next.js", icon: "next" },
  { key: "vue", name: "Vue", icon: "vue" },
  { key: "nuxt", name: "Nuxt", icon: "nuxt" },
  { key: "angular", name: "Angular", icon: "angular" },
  { key: "node", name: "Node.js", icon: "node" },
  { key: "svelte", name: "SvelteKit", icon: "svelte" },
  { key: "astro", name: "Astro", icon: "astro" },
  { key: "reactNative", name: "React Native", icon: "expo" },
  { key: "flutter", name: "Flutter", icon: "flutter" },
  { key: "spring", name: "Spring", icon: "spring" },
  { key: "apple", name: "iOS and macOS", icon: "apple" },
  { key: "android", name: "Android", icon: "android" },
  { key: "dotnet", name: ".NET", icon: "dotnet" },
] as const satisfies ReadonlyArray<{ key: string; name: string; icon: StackIconKey }>;

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
          <a
            href={href}
            data-tip={item.tip}
            data-umami-event="click-cta"
            data-umami-event-location="marquee"
            data-umami-event-target={row}
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
          </a>
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
    <section aria-label={t("label")} className="vk-marquee-band" id="marquee">
      <IconSprite />
      <p className="vk-marquee-intro px-6 text-center text-fd-muted-foreground">{t("intro")}</p>
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
