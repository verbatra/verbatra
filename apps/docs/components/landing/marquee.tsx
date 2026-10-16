import type { SupportedFormat } from "@verbatra/sdk";
import { getLocale, getTranslations } from "next-intl/server";
import type { CSSProperties, ReactNode } from "react";
import {
  type AvailableFromCopy,
  AvailableFromPill,
  availableFromCopy,
} from "@/components/available-from";
import { StackIcon, type StackIconKey, StackIconSprite } from "@/components/stack-icons";
import { IntentPrefetchLink } from "@/components/ui/intent-prefetch-link";
import { localizedPath, toLocale } from "@/lib/i18n";
import { FORMAT_DISPLAY, SUPPORTED_FORMAT_IDS } from "@/lib/landing-facts";
import { landingProviders, type ProviderKind } from "@/lib/landing-providers";
import { RELEASE_BADGE } from "@/lib/release-badge";
import { MarqueeMotion } from "./islands";
import { PlainList } from "./plain-list";
import { Section } from "./section";
import { SectionHead } from "./section-head";

export const MARQUEE_ICON_PREFIX = "marquee";

export const MARQUEE_COPIES = 2;

export const PROVIDER_KIND_ICONS: Readonly<Record<ProviderKind, StackIconKey>> = {
  llm: "llm",
  machine: "machine",
  local: "server",
};

export const FORMAT_ICONS: Readonly<Record<SupportedFormat, StackIconKey>> = {
  "i18next-json": "json",
  "vue-i18n-json": "json",
  "next-intl-json": "json",
  "ngx-translate-json": "json",
  xliff: "xliff",
  yaml: "yaml",
  arb: "json",
  properties: "ini",
  "apple-strings": "ini",
  "apple-xcstrings": "json",
  "android-xml": "xliff",
  "gettext-po": "po",
  ini: "ini",
  resx: "xliff",
};

type MarqueeItem = {
  readonly id: string;
  readonly label: string;
  readonly icon: StackIconKey;
  readonly badge: AvailableFromCopy | null;
};

type MarqueeRowProps = {
  readonly id: "providers" | "formats";
  readonly title: string;
  readonly items: ReadonlyArray<MarqueeItem>;
  readonly moreHref: string;
  readonly moreLabel: string;
};

export function providerItems(releaseBadge: AvailableFromCopy): ReadonlyArray<MarqueeItem> {
  return landingProviders().map((provider) => ({
    id: provider.id,
    label: provider.label,
    icon: PROVIDER_KIND_ICONS[provider.kind],
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

function Items({ items }: { items: ReadonlyArray<MarqueeItem> }): ReactNode {
  return items.map((item) => (
    <li key={item.id} className="vk-marquee-item" data-item={item.id}>
      <StackIcon
        prefix={MARQUEE_ICON_PREFIX}
        icon={item.icon}
        size={18}
        className="vk-marquee-glyph"
      />
      <span>{item.label}</span>
      {item.badge === null ? null : <AvailableFromPill {...item.badge} />}
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
  const providers = providerItems(
    await availableFromCopy(RELEASE_BADGE.version, undefined, locale),
  );
  const formats = formatItems();

  return (
    <Section band id="marquee">
      <SectionHead id="marquee-heading" title={t("heading")} lead={t("lead")} />
      <StackIconSprite
        prefix={MARQUEE_ICON_PREFIX}
        icons={[...providers, ...formats].map((item) => item.icon)}
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
    </Section>
  );
}
