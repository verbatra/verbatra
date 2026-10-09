"use client";

import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { type ReactNode, useState } from "react";
import { TabList, tabPanelProps } from "@/components/ui/tabs";
import { trackUmamiEvent } from "@/lib/umami";

export const SHOWCASE_ID = "showcase";
export const SHOWCASE_TABS = ["tryIt", "studio"] as const;
export type ShowcaseTab = (typeof SHOWCASE_TABS)[number];

export const STUDIO_SHOT = {
  src: "/screenshots/studio-translations-dark.webp",
  width: 2880,
  height: 2360,
} as const;

function isTab(id: string): id is ShowcaseTab {
  return (SHOWCASE_TABS as ReadonlyArray<string>).includes(id);
}

export function ShowcaseTabs({
  studioHref,
  children,
}: {
  studioHref: string;
  children: ReactNode;
}): ReactNode {
  const t = useTranslations("landing.showcase");
  const [active, setActive] = useState<ShowcaseTab>("tryIt");
  const [studioSeen, setStudioSeen] = useState(false);

  function select(id: string) {
    if (!isTab(id) || id === active) return;
    setActive(id);
    if (id === "studio") setStudioSeen(true);
    trackUmamiEvent("showcase-tab", { tab: id });
  }

  return (
    <div className="vk-showcase not-prose">
      <div className="vk-showcase-bar">
        <TabList
          tabs={SHOWCASE_TABS.map((id) => ({ id, label: t(`tabs.${id}`) }))}
          active={active}
          onSelect={select}
          ariaLabel={t("tablist")}
          variant="segmented"
          idPrefix={SHOWCASE_ID}
        />
      </div>
      <div className="vk-showcase-body">
        <div {...tabPanelProps(SHOWCASE_ID, "tryIt", active)} className="vk-showcase-panel">
          {children}
        </div>
        <div
          {...tabPanelProps(SHOWCASE_ID, "studio", active)}
          className="vk-showcase-panel vk-showcase-studio"
        >
          <div className="vk-showcase-shot">
            {studioSeen ? (
              <Image
                src={STUDIO_SHOT.src}
                alt={t("studio.alt")}
                width={STUDIO_SHOT.width}
                height={STUDIO_SHOT.height}
                loading="lazy"
                sizes="(min-width: 1285px) 1285px, 100vw"
                className="vk-showcase-shot-image"
              />
            ) : null}
          </div>
          <p className="vk-showcase-caption">
            {t("studio.caption")}{" "}
            <Link href={studioHref} className="vk-prose-link">
              {t("studio.link")}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
