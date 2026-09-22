import {
  SiAndroid,
  SiAngular,
  SiApple,
  SiAstro,
  SiDotnet,
  SiExpo,
  SiFlutter,
  SiGnu,
  SiJson,
  SiNextdotjs,
  SiNodedotjs,
  SiNuxt,
  SiReact,
  SiSpring,
  SiSvelte,
  SiVuedotjs,
  SiXcode,
  SiXml,
  SiYaml,
} from "@icons-pack/react-simple-icons";
import type { SupportedFormat } from "@verbatra/sdk";
import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { type Locale, localizedPath } from "@/lib/i18n";

const ICON = 20;
const SI = { size: ICON, color: "currentColor", "aria-hidden": true } as const;

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

type Framework = { key: FrameworkKey; name: string; icon: ReactNode };
type Format = { id: SupportedFormat; name: string; icon: ReactNode };

const FRAMEWORKS: ReadonlyArray<Framework> = [
  { key: "react", name: "React", icon: <SiReact {...SI} /> },
  { key: "next", name: "Next.js", icon: <SiNextdotjs {...SI} /> },
  { key: "vue", name: "Vue", icon: <SiVuedotjs {...SI} /> },
  { key: "nuxt", name: "Nuxt", icon: <SiNuxt {...SI} /> },
  { key: "angular", name: "Angular", icon: <SiAngular {...SI} /> },
  { key: "node", name: "Node.js", icon: <SiNodedotjs {...SI} /> },
  { key: "svelte", name: "SvelteKit", icon: <SiSvelte {...SI} /> },
  { key: "astro", name: "Astro", icon: <SiAstro {...SI} /> },
  { key: "reactNative", name: "React Native", icon: <SiExpo {...SI} /> },
  { key: "flutter", name: "Flutter", icon: <SiFlutter {...SI} /> },
  { key: "spring", name: "Spring", icon: <SiSpring {...SI} /> },
  { key: "apple", name: "iOS and macOS", icon: <SiApple {...SI} /> },
  { key: "android", name: "Android", icon: <SiAndroid {...SI} /> },
  { key: "dotnet", name: ".NET", icon: <SiDotnet {...SI} /> },
];

function IniGlyph(): ReactNode {
  return (
    <svg
      width={ICON}
      height={ICON}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden="true"
    >
      <path d="M6 3h8l5 5v13H6z" />
      <path d="M14 3v5h5M9 12h6M9 16h6" />
    </svg>
  );
}

const FORMATS: ReadonlyArray<Format> = [
  { id: "i18next-json", name: "i18next JSON", icon: <SiJson {...SI} /> },
  { id: "vue-i18n-json", name: "vue-i18n JSON", icon: <SiVuedotjs {...SI} /> },
  { id: "next-intl-json", name: "next-intl JSON", icon: <SiNextdotjs {...SI} /> },
  { id: "ngx-translate-json", name: "ngx-translate JSON", icon: <SiAngular {...SI} /> },
  { id: "xliff", name: "XLIFF", icon: <SiXml {...SI} /> },
  { id: "yaml", name: "YAML", icon: <SiYaml {...SI} /> },
  { id: "arb", name: "Flutter ARB", icon: <SiFlutter {...SI} /> },
  { id: "properties", name: "Java .properties", icon: <SiSpring {...SI} /> },
  { id: "apple-strings", name: "Apple .strings", icon: <SiApple {...SI} /> },
  { id: "apple-xcstrings", name: "Xcode .xcstrings", icon: <SiXcode {...SI} /> },
  { id: "android-xml", name: "Android strings.xml", icon: <SiAndroid {...SI} /> },
  { id: "gettext-po", name: "gettext .po", icon: <SiGnu {...SI} /> },
  { id: "ini", name: "INI", icon: <IniGlyph /> },
  { id: "resx", name: ".NET .resx", icon: <SiDotnet {...SI} /> },
];

type TrackItem = { key: string; name: string; icon: ReactNode; tip: string };

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
            className="vk-tip inline-flex min-h-9 items-center gap-2.5 px-1 text-[15px] font-medium text-fd-muted-foreground transition-colors hover:text-fd-foreground focus-visible:text-fd-foreground"
            style={{ fontFamily: "var(--font-display)" }}
          >
            <span className="shrink-0 text-fd-foreground opacity-85">{item.icon}</span>
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
    <section aria-label={t("label")} className="pt-14">
      <p className="px-6 text-center text-[15px] text-fd-muted-foreground">{t("intro")}</p>
      <div className="mt-[22px]">
        <Row items={frameworks} href={formatsHref} label={t("frameworksLabel")} direction="left" />
        <Row items={formats} href={formatsHref} label={t("formatsLabel")} direction="right" />
      </div>
    </section>
  );
}
