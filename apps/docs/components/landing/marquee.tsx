import type { SupportedFormat } from "@verbatra/sdk";
import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { StackIcon, type StackIconKey, StackIconSprite } from "@/components/stack-icons";
import { type Locale, localizedPath } from "@/lib/i18n";

const ICON = 20;
const ICON_PREFIX = "vk-marquee-icon";

type FrameworkKey =
  | "react"
  | "next"
  | "vue"
  | "nuxt"
  | "angular"
  | "node"
  | "svelte"
  | "astro"
  | "reactNative"
  | "flutter"
  | "spring"
  | "apple"
  | "android"
  | "dotnet";

type Framework = { key: FrameworkKey; name: string; icon: StackIconKey };
type Format = { id: SupportedFormat; name: string; icon: StackIconKey };

const FRAMEWORKS: ReadonlyArray<Framework> = [
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
];

const FORMATS: ReadonlyArray<Format> = [
  { id: "i18next-json", name: "i18next JSON", icon: "json" },
  { id: "vue-i18n-json", name: "vue-i18n JSON", icon: "vue" },
  { id: "next-intl-json", name: "next-intl JSON", icon: "next" },
  { id: "ngx-translate-json", name: "ngx-translate JSON", icon: "angular" },
  { id: "xliff", name: "XLIFF", icon: "xml" },
  { id: "yaml", name: "YAML", icon: "yaml" },
  { id: "arb", name: "Flutter ARB", icon: "flutter" },
  { id: "properties", name: "Java .properties", icon: "spring" },
  { id: "apple-strings", name: "Apple .strings", icon: "apple" },
  { id: "apple-xcstrings", name: "Xcode .xcstrings", icon: "xcode" },
  { id: "android-xml", name: "Android strings.xml", icon: "android" },
  { id: "gettext-po", name: "gettext .po", icon: "gnu" },
  { id: "ini", name: "INI", icon: "ini" },
  { id: "resx", name: ".NET .resx", icon: "dotnet" },
];

function IconSprite(): ReactNode {
  return (
    <StackIconSprite
      prefix={ICON_PREFIX}
      icons={[...FRAMEWORKS, ...FORMATS].map((item) => item.icon)}
    />
  );
}

function Icon({ icon }: { icon: StackIconKey }): ReactNode {
  return <StackIcon prefix={ICON_PREFIX} icon={icon} size={ICON} className="vk-marquee-icon" />;
}

type TrackItem = { key: string; name: string; icon: StackIconKey; tip: string };

function Track({
  items,
  href,
  label,
  hidden = false,
}: {
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
            tabIndex={hidden ? -1 : undefined}
            className="vk-tip vk-marquee-item inline-flex items-center px-1 font-medium text-fd-muted-foreground transition-colors hover:text-fd-foreground focus-visible:text-fd-foreground"
            style={{ fontFamily: "var(--font-display)" }}
          >
            <span className="shrink-0 text-fd-foreground opacity-85">
              <Icon icon={item.icon} />
            </span>
            <span>{item.name}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

function Row({
  items,
  href,
  label,
  direction,
}: {
  items: ReadonlyArray<TrackItem>;
  href: string;
  label: string;
  direction: "left" | "right";
}): ReactNode {
  return (
    <div className="vk-marquee" data-direction={direction}>
      <Track items={items} href={href} label={label} />
      <Track items={items} href={href} label={label} hidden />
    </div>
  );
}

export async function Marquee(): Promise<ReactNode> {
  const t = await getTranslations("landing.marquee");
  const locale = (await getLocale()) as Locale;
  const formatsHref = localizedPath(locale, "/docs/formats");

  const frameworks: ReadonlyArray<TrackItem> = FRAMEWORKS.map((framework) => ({
    ...framework,
    tip: t(`frameworks.${framework.key}`),
  }));
  const formats: ReadonlyArray<TrackItem> = FORMATS.map((format) => ({
    key: format.id,
    name: format.name,
    icon: format.icon,
    tip: t("formatTip", { id: format.id }),
  }));

  return (
    <section aria-label={t("label")} className="vk-marquee-band">
      <IconSprite />
      <p className="vk-marquee-intro px-6 text-center text-fd-muted-foreground">{t("intro")}</p>
      <div className="vk-marquee-rows">
        <Row items={frameworks} href={formatsHref} label={t("frameworksLabel")} direction="left" />
        <Row items={formats} href={formatsHref} label={t("formatsLabel")} direction="right" />
      </div>
    </section>
  );
}
