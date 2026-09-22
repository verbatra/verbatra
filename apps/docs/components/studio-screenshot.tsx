"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { type ReactNode, useState } from "react";
import { TabList } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

const SHOTS = {
  review: { width: 2880, height: 1200 },
  translations: { width: 2880, height: 2360 },
} as const;

const THEMES = ["dark", "light"] as const;

const TAB_CLASS = "rounded-md px-2.5 py-1 text-xs transition-colors";

export type StudioShot = keyof typeof SHOTS;

export type StudioScreenshotProps = {
  shot: StudioShot;
  alt: string;
  caption?: string;
  priority?: boolean;
  elevated?: boolean;
  className?: string;
};

export function StudioScreenshot({
  shot,
  alt,
  caption,
  priority = false,
  elevated = true,
  className,
}: StudioScreenshotProps): ReactNode {
  const t = useTranslations("docs.screenshot");
  const [theme, setTheme] = useState<(typeof THEMES)[number]>("dark");
  const { width, height } = SHOTS[shot];

  return (
    <figure className={cn("not-prose my-8", className)}>
      <div
        className="overflow-hidden rounded-xl border border-fd-border"
        style={{
          background: "var(--surface-card)",
          boxShadow: elevated ? "var(--shadow-panel)" : undefined,
        }}
      >
        <div className="flex items-center justify-between gap-3 border-b border-fd-border px-4 py-2.5">
          <span className="font-mono text-xs tracking-wide text-fd-muted-foreground">
            {t("label")}
          </span>
          <TabList
            tabs={THEMES.map((id) => ({ id, label: t(id) }))}
            active={theme}
            onSelect={(id) => setTheme(id as (typeof THEMES)[number])}
            ariaLabel={t("tablistLabel")}
            className="flex gap-1"
            tabClassName={TAB_CLASS}
            variant="pill"
          />
        </div>
        <Image
          src={`/screenshots/studio-${shot}-${theme}.webp`}
          alt={alt}
          width={width}
          height={height}
          sizes="(max-width: 768px) 100vw, 900px"
          priority={priority}
          className="block h-auto w-full"
        />
      </div>
      {caption ? (
        <figcaption className="mt-3 text-sm leading-relaxed text-fd-muted-foreground">
          {caption}
        </figcaption>
      ) : null}
    </figure>
  );
}
