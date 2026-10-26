import type { SupportedFormat } from "@verbatra/sdk";
import { getLocale, getTranslations } from "next-intl/server";
import type { CSSProperties, ReactNode } from "react";
import { availableFromCopy } from "@/components/available-from";
import { BrandMark, BrandMarkSprite } from "@/components/brand-marks";
import { NewPill } from "@/components/new-pill";
import { IntentPrefetchLink } from "@/components/ui/intent-prefetch-link";
import type { BrandMarkId } from "@/lib/brand-marks";
import { localizedPath, toLocale } from "@/lib/i18n";
import { FORMAT_DISPLAY, type MachineProviderId, SUPPORTED_FORMAT_IDS } from "@/lib/landing-facts";
import { landingProviders } from "@/lib/landing-providers";
import { RELEASE_BADGE } from "@/lib/release-badge";
import { MarqueeMotion } from "./islands";
import { PlainList } from "./plain-list";

export const MARQUEE_ICON_PREFIX = "marquee-mark";

export const MARQUEE_COPIES = 2;

export const MARQUEE_GLYPHS = {
  braces:
    "M8 4c-2 0-3 1-3 3v2c0 1.5-1 3-2.5 3 1.5 0 2.5 1.5 2.5 3v2c0 2 1 3 3 3M16 4c2 0 3 1 3 3v2c0 1.5 1 3 2.5 3-1.5 0-2.5 1.5-2.5 3v2c0 2-1 3-3 3",
  swap: "M4 8h14l-4-4M20 16H6l4 4",
  bubble: "M4 5h16v11H11l-4 4v-4H4z",
  sliders: "M4 7h9M17 7h3M4 17h3M11 17h9M15 4v6M9 14v6",
  cube: "M12 3l8 4.5v9L12 21l-8-4.5v-9zM4 7.5l8 4.5 8-4.5M12 12v9",
  plug: "M9 3v5M15 3v5M6 8h12v3a6 6 0 0 1-12 0zM12 17v4",
  globe: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18",
  chip: "M7 7h10v10H7zM10 10h4v4h-4zM9 3v4M15 3v4M9 17v4M15 17v4M3 9h4M3 15h4M17 9h4M17 15h4",
  languages: "M3 4h11v8H9l-3 3v-3H3zM10 15v1h5l3 3v-3h3v-8h-4",
  server: "M4 4h16v6H4zM4 14h16v6H4zM8 7h.01M8 17h.01",
} as const;

export type MarqueeGlyphId = keyof typeof MARQUEE_GLYPHS;

export type MarqueeMark =
  | { readonly kind: "brand"; readonly mark: BrandMarkId }
  | { readonly kind: "glyph"; readonly glyph: MarqueeGlyphId };

const brand = (mark: BrandMarkId): MarqueeMark => ({ kind: "brand", mark });
const glyph = (id: MarqueeGlyphId): MarqueeMark => ({ kind: "glyph", glyph: id });

export const PROVIDER_ICONS: Readonly<Record<MachineProviderId, MarqueeMark>> = {
  anthropic: glyph("chip"),
  openai: brand("openai"),
  gemini: glyph("chip"),
  deepl: glyph("languages"),
  "google-translate": glyph("languages"),
  "openai-compatible": glyph("plug"),
  libretranslate: glyph("server"),
};

export const FORMAT_ICONS: Readonly<Record<SupportedFormat, MarqueeMark>> = {
  "i18next-json": glyph("globe"),
  "vue-i18n-json": glyph("braces"),
  "next-intl-json": brand("deviconNextjs"),
  "ngx-translate-json": brand("angular"),
  xliff: glyph("swap"),
  yaml: brand("deviconYaml"),
  arb: brand("fontawesomeFlutter"),
  properties: brand("deviconSpring"),
  "apple-strings": brand("fontawesomeApple"),
  "apple-xcstrings": brand("fontawesomeApple"),
  "android-xml": brand("android"),
  "gettext-po": glyph("bubble"),
  ini: glyph("sliders"),
  resx: glyph("cube"),
};

type MarqueeBadge = {
  readonly label: string;
  readonly release: string;
  readonly version: string;
};

type MarqueeItem = {
  readonly id: string;
  readonly label: string;
  readonly icon: MarqueeMark;
  readonly badge: MarqueeBadge | null;
};

type MarqueeRowProps = {
  readonly id: "providers" | "formats";
  readonly title: string;
  readonly items: ReadonlyArray<MarqueeItem>;
};

export function providerItems(releaseBadge: MarqueeBadge): ReadonlyArray<MarqueeItem> {
  return landingProviders().map((provider) => ({
    id: provider.id,
    label: provider.label,
    icon: PROVIDER_ICONS[provider.id],
    badge: provider.isNew ? releaseBadge : null,
  }));
}

export function formatItems(): ReadonlyArray<MarqueeItem> {
  return SUPPORTED_FORMAT_IDS.map((id) => ({
    id,
    label: FORMAT_DISPLAY[id].label,
    icon: FORMAT_ICONS[id],
    badge: null,
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

function Items({ items }: { items: ReadonlyArray<MarqueeItem> }): ReactNode {
  return items.map((item) => (
    <li key={item.id} className="vk-marquee-item" data-item={item.id}>
      <ItemMark mark={item.icon} />
      <span className="vk-marquee-name">{item.label}</span>
      {item.badge === null ? null : (
        <>
          <NewPill>
            {item.badge.label}
            <span className="sr-only"> ({item.badge.release})</span>
          </NewPill>
          <span aria-hidden="true" className="vk-marquee-release">
            {item.badge.version}
          </span>
        </>
      )}
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
  const { label: release } = await availableFromCopy(RELEASE_BADGE.version, undefined, locale);
  const providers = providerItems({ label: t("new"), release, version: RELEASE_BADGE.version });
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
