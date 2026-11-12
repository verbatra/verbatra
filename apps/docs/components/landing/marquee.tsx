import type { SupportedFormat } from "@verbatra/sdk";
import { getLocale, getTranslations } from "next-intl/server";
import type { CSSProperties, ReactNode } from "react";
import { BrandMark, BrandMarkSprite } from "@/components/brand-marks";
import { NewPill } from "@/components/new-pill";
import { StackIcon, type StackIconKey, StackIconSprite } from "@/components/stack-icons";
import { IntentPrefetchLink } from "@/components/ui/intent-prefetch-link";
import type { BrandMarkId } from "@/lib/brand-marks";
import { localizedPath, toLocale } from "@/lib/i18n";
import { FORMAT_DISPLAY, type MachineProviderId, SUPPORTED_FORMAT_IDS } from "@/lib/landing-facts";
import { landingProviders } from "@/lib/landing-providers";
import { MarqueeMotion } from "./islands";
import { PlainList } from "./plain-list";

export const MARQUEE_ICON_PREFIX = "marquee-mark";

export const MARQUEE_FILE_PREFIX = "marquee-file";

export const MARQUEE_COPIES = 2;

export const MARQUEE_GLYPHS = {
  sliders: "M4 7h9M17 7h3M4 17h3M11 17h9M15 4v6M9 14v6",
  plug: "M9 3v5M15 3v5M6 8h12v3a6 6 0 0 1-12 0zM12 17v4",
} as const;

export type MarqueeGlyphId = keyof typeof MARQUEE_GLYPHS;

export type MarqueeMark =
  | { readonly kind: "brand"; readonly mark: BrandMarkId }
  | { readonly kind: "glyph"; readonly glyph: MarqueeGlyphId }
  | { readonly kind: "file"; readonly icon: StackIconKey };

const brand = (mark: BrandMarkId): MarqueeMark => ({ kind: "brand", mark });
const glyph = (id: MarqueeGlyphId): MarqueeMark => ({ kind: "glyph", glyph: id });
const file = (icon: StackIconKey): MarqueeMark => ({ kind: "file", icon });

export const PROVIDER_ICONS: Readonly<Record<MachineProviderId, MarqueeMark>> = {
  anthropic: brand("simpleAnthropic"),
  openai: brand("openai"),
  gemini: brand("simpleGemini"),
  deepl: brand("simpleDeepl"),
  "google-translate": brand("simpleGoogleTranslate"),
  "openai-compatible": glyph("plug"),
  opencode: brand("simpleOpencode"),
  libretranslate: brand("simpleLibretranslate"),
};

export const FORMAT_ICONS: Readonly<Record<SupportedFormat, MarqueeMark>> = {
  "i18next-json": brand("simpleI18next"),
  "vue-i18n-json": brand("fontawesomeVuejs"),
  "next-intl-json": brand("deviconNextjs"),
  "ngx-translate-json": brand("angular"),
  xliff: file("xliff"),
  yaml: brand("deviconYaml"),
  arb: brand("fontawesomeFlutter"),
  properties: brand("deviconSpring"),
  "apple-strings": brand("fontawesomeApple"),
  "apple-xcstrings": brand("fontawesomeApple"),
  "android-xml": brand("android"),
  "gettext-po": brand("simpleGnu"),
  ini: glyph("sliders"),
  resx: brand("dotnet"),
};

type MarqueeItem = {
  readonly id: string;
  readonly label: string;
  readonly icon: MarqueeMark;
  readonly newLabel: string | null;
};

type MarqueeRowProps = {
  readonly id: "providers" | "formats";
  readonly title: string;
  readonly items: ReadonlyArray<MarqueeItem>;
};

export function providerItems(newLabel: string): ReadonlyArray<MarqueeItem> {
  return landingProviders().map((provider) => ({
    id: provider.id,
    label: provider.label,
    icon: PROVIDER_ICONS[provider.id],
    newLabel: provider.isNew ? newLabel : null,
  }));
}

export function formatItems(): ReadonlyArray<MarqueeItem> {
  return SUPPORTED_FORMAT_IDS.map((id) => ({
    id,
    label: FORMAT_DISPLAY[id].label,
    icon: FORMAT_ICONS[id],
    newLabel: null,
  }));
}

function ItemMark({ mark }: { mark: MarqueeMark }): ReactNode {
  if (mark.kind === "glyph") {
    return (
      <svg
        aria-hidden="true"
        focusable="false"
        viewBox="0 0 24 24"
        width={18}
        height={18}
        className="vk-marquee-glyph"
      >
        <path d={MARQUEE_GLYPHS[mark.glyph]} />
      </svg>
    );
  }
  if (mark.kind === "file") {
    return (
      <StackIcon
        prefix={MARQUEE_FILE_PREFIX}
        icon={mark.icon}
        size={18}
        className="vk-marquee-glyph"
      />
    );
  }
  return (
    <BrandMark
      prefix={MARQUEE_ICON_PREFIX}
      mark={mark.mark}
      size={18}
      className="vk-marquee-mark"
    />
  );
}

function brandMarks(items: ReadonlyArray<MarqueeItem>): ReadonlyArray<BrandMarkId> {
  return items.flatMap((item) => (item.icon.kind === "brand" ? [item.icon.mark] : []));
}

function fileIcons(items: ReadonlyArray<MarqueeItem>): ReadonlyArray<StackIconKey> {
  return items.flatMap((item) => (item.icon.kind === "file" ? [item.icon.icon] : []));
}

function Items({ items }: { items: ReadonlyArray<MarqueeItem> }): ReactNode {
  return items.map((item) => (
    <li key={item.id} className="vk-marquee-item" data-item={item.id}>
      <ItemMark mark={item.icon} />
      <span className="vk-marquee-name">{item.label}</span>
      {item.newLabel === null ? null : <NewPill>{item.newLabel}</NewPill>}
    </li>
  ));
}

function MarqueeRow({ id, title, items }: MarqueeRowProps): ReactNode {
  const titleId = `marquee-${id}`;
  const speed = { "--marquee-items": items.length } as CSSProperties;
  return (
    <div className="vk-marquee-row" data-row={id}>
      <h3 id={titleId} className="sr-only">
        {title}
      </h3>
      {/* biome-ignore lint/a11y/useSemanticElements: a fieldset groups form controls; this names a row that scrolls sideways without adding a landmark */}
      <div
        role="group"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: the static row scrolls sideways, so the keyboard needs a stop to scroll it
        tabIndex={0}
        aria-labelledby={titleId}
        className="vk-edge-fade vk-marquee-viewport"
      >
        <div className="vk-marquee-track" style={speed}>
          <PlainList aria-labelledby={titleId} className="vk-marquee-list">
            <Items items={items} />
          </PlainList>
          {Array.from({ length: MARQUEE_COPIES }, (_, copy) => (
            <PlainList
              key={copy}
              aria-hidden="true"
              inert
              className="vk-marquee-list vk-marquee-copy"
            >
              <Items items={items} />
            </PlainList>
          ))}
        </div>
      </div>
    </div>
  );
}

export async function Marquee(): Promise<ReactNode> {
  const t = await getTranslations("landing.marquee");
  const locale = toLocale(await getLocale());
  const providers = providerItems(t("new"));
  const formats = formatItems();

  return (
    <section id="marquee" aria-labelledby="marquee-heading" className="vk-marquee-section">
      <h2 id="marquee-heading" className="vk-marquee-heading vk-gutter">
        {t("heading")}
      </h2>
      <BrandMarkSprite
        prefix={MARQUEE_ICON_PREFIX}
        marks={brandMarks([...formats, ...providers])}
      />
      <StackIconSprite prefix={MARQUEE_FILE_PREFIX} icons={fileIcons(formats)} />
      <MarqueeMotion pauseLabel={t("pause")} playLabel={t("play")}>
        <MarqueeRow id="formats" title={t("formats")} items={formats} />
        <MarqueeRow id="providers" title={t("providers")} items={providers} />
        <div className="vk-marquee-links vk-gutter">
          <IntentPrefetchLink
            href={localizedPath(locale, "/docs/formats")}
            className="vk-prose-link vk-marquee-more"
          >
            {t("allFormats")}
          </IntentPrefetchLink>
          <IntentPrefetchLink
            href={localizedPath(locale, "/docs/providers")}
            className="vk-prose-link vk-marquee-more"
          >
            {t("allProviders")}
          </IntentPrefetchLink>
        </div>
      </MarqueeMotion>
    </section>
  );
}
