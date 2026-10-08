import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { StackIcon, type StackIconKey, StackIconSprite } from "@/components/stack-icons";
import { type Locale, localizedPath } from "@/lib/i18n";
import {
  FORMAT_DISPLAY,
  MACHINE_PROVIDER_IDS,
  type MachineProviderId,
  SUPPORTED_FORMAT_IDS,
} from "@/lib/landing-facts";

const ICON = 20;
const ICON_PREFIX = "vk-marquee-icon";

type Display = { name: string; icon: StackIconKey };

type ProviderKind =
  | "anthropic"
  | "openai"
  | "gemini"
  | "deepl"
  | "googleTranslate"
  | "openaiCompatible"
  | "libretranslate";

const PROVIDER_DISPLAY: Readonly<Record<MachineProviderId, Display & { kind: ProviderKind }>> = {
  anthropic: { name: "Anthropic", icon: "anthropic", kind: "anthropic" },
  openai: { name: "OpenAI", icon: "openai", kind: "openai" },
  gemini: { name: "Gemini", icon: "gemini", kind: "gemini" },
  deepl: { name: "DeepL", icon: "deepl", kind: "deepl" },
  "google-translate": {
    name: "Google Translate",
    icon: "googleTranslate",
    kind: "googleTranslate",
  },
  "openai-compatible": {
    name: "OpenAI-compatible",
    icon: "ollama",
    kind: "openaiCompatible",
  },
  libretranslate: { name: "LibreTranslate", icon: "libretranslate", kind: "libretranslate" },
};

function IconSprite(): ReactNode {
  return (
    <StackIconSprite
      prefix={ICON_PREFIX}
      icons={[
        ...Object.values(FORMAT_DISPLAY).map((item) => item.icon),
        ...Object.values(PROVIDER_DISPLAY).map((item) => item.icon),
      ]}
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

  const formats: ReadonlyArray<TrackItem> = SUPPORTED_FORMAT_IDS.map((id) => ({
    key: id,
    name: FORMAT_DISPLAY[id].label,
    icon: FORMAT_DISPLAY[id].icon,
    tip: t("formatTip", { id }),
  }));
  const providers: ReadonlyArray<TrackItem> = MACHINE_PROVIDER_IDS.map((id) => {
    const { name, icon, kind } = PROVIDER_DISPLAY[id];
    return { key: id, name, icon, tip: t(`providers.${kind}`) };
  });

  return (
    <section aria-label={t("label")} className="vk-marquee-band" id="marquee">
      <IconSprite />
      <p className="vk-marquee-intro px-6 text-center text-fd-muted-foreground">{t("intro")}</p>
      <div className="vk-marquee-rows">
        <Row
          items={formats}
          href={localizedPath(locale, "/docs/formats")}
          label={t("formatsLabel")}
          direction="left"
        />
        <Row
          items={providers}
          href={localizedPath(locale, "/docs/providers")}
          label={t("providersLabel")}
          direction="right"
        />
      </div>
    </section>
  );
}
