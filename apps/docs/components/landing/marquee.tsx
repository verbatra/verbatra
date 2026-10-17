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
import { Section } from "./section";
import { SectionAside } from "./section-head";

export const MARQUEE_ICON_PREFIX = "marquee-mark";

export const MARQUEE_COPIES = 2;

export type MarqueeMark =
  | { readonly kind: "brand"; readonly mark: BrandMarkId }
  | { readonly kind: "chip"; readonly text: string };

const brand = (mark: BrandMarkId): MarqueeMark => ({ kind: "brand", mark });
const chip = (text: string): MarqueeMark => ({ kind: "chip", text });

export const PROVIDER_ICONS: Readonly<Record<MachineProviderId, MarqueeMark>> = {
  anthropic: brand("anthropic"),
  openai: brand("openai"),
  gemini: brand("googlegemini"),
  deepl: brand("deepl"),
  "google-translate": brand("googletranslate"),
  "openai-compatible": chip("/v1"),
  libretranslate: brand("libretranslate"),
};

export const FORMAT_ICONS: Readonly<Record<SupportedFormat, MarqueeMark>> = {
  "i18next-json": brand("i18next"),
  "vue-i18n-json": chip(".json"),
  "next-intl-json": brand("nextdotjs"),
  "ngx-translate-json": brand("angular"),
  xliff: chip(".xlf"),
  yaml: brand("yaml"),
  arb: brand("flutter"),
  properties: brand("spring"),
  "apple-strings": brand("apple"),
  "apple-xcstrings": brand("apple"),
  "android-xml": brand("android"),
  "gettext-po": chip(".po"),
  ini: chip(".ini"),
  resx: brand("dotnet"),
};

type MarqueeBadge = { readonly label: string; readonly release: string };

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
  readonly moreHref: string;
  readonly moreLabel: string;
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
  if (mark.kind === "chip") {
    return (
      <span aria-hidden="true" className="vk-marquee-chip">
        {mark.text}
      </span>
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
        <NewPill>
          {item.badge.label}
          <span className="sr-only"> ({item.badge.release})</span>
        </NewPill>
      )}
    </li>
  ));
}

function MarqueeRow({ id, title, items, moreHref, moreLabel }: MarqueeRowProps): ReactNode {
  const titleId = `marquee-${id}`;
  const speed = { "--marquee-items": items.length } as CSSProperties;
  return (
    <div className="vk-marquee-row" data-row={id}>
      <h3 id={titleId} className="vk-marquee-title">
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
      <IntentPrefetchLink href={moreHref} className="vk-prose-link vk-marquee-more">
        {moreLabel}
      </IntentPrefetchLink>
    </div>
  );
}

export async function Marquee(): Promise<ReactNode> {
  const t = await getTranslations("landing.marquee");
  const locale = toLocale(await getLocale());
  const { label: release } = await availableFromCopy(RELEASE_BADGE.version, undefined, locale);
  const providers = providerItems({ label: t("new"), release });
  const formats = formatItems();

  return (
    <Section band id="marquee" labelledBy="marquee-heading">
      <SectionAside id="marquee-heading" title={t("heading")} lead={t("lead")}>
        <BrandMarkSprite
          prefix={MARQUEE_ICON_PREFIX}
          marks={brandMarks([...providers, ...formats])}
        />
        <MarqueeMotion pauseLabel={t("pause")}>
          <MarqueeRow
            id="providers"
            title={t("providers")}
            items={providers}
            moreHref={localizedPath(locale, "/docs/providers")}
            moreLabel={t("allProviders")}
          />
          <MarqueeRow
            id="formats"
            title={t("formats")}
            items={formats}
            moreHref={localizedPath(locale, "/docs/formats")}
            moreLabel={t("allFormats")}
          />
        </MarqueeMotion>
      </SectionAside>
    </Section>
  );
}
