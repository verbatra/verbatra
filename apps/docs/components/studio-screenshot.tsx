"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { type ReactNode, useState } from "react";
import { PanelCaption } from "@/components/ui/panel-caption";
import { STUDIO_SHOTS, type StudioShot, studioShotSrc } from "@/lib/studio-shots";
import { THEMES, type ThemeName } from "@/lib/theme";
import { useSiteTheme } from "@/lib/use-site-theme";
import { cn } from "@/lib/utils";

const THEME_BUTTON_CLASS = "vk-tap rounded-md px-2.5 py-1 text-xs transition-colors";

type StudioScreenshotProps = {
  shot: StudioShot;
  alt: string;
  caption?: string;
  priority?: boolean;
  elevated?: boolean;
  zoomOnPhone?: boolean;
  className?: string;
};

const SIZES = "(max-width: 768px) 100vw, 900px";

const ZOOMED_SIZES = "(max-width: 639px) 200vw, (max-width: 768px) 100vw, 900px";

function useResolvedSiteTheme(): ThemeName {
  const { resolvedTheme } = useSiteTheme();
  return resolvedTheme === "light" ? "light" : "dark";
}

export function StudioScreenshot({
  shot,
  alt,
  caption,
  priority = false,
  elevated = true,
  zoomOnPhone = false,
  className,
}: StudioScreenshotProps): ReactNode {
  const t = useTranslations("docs.screenshot");
  const siteTheme = useResolvedSiteTheme();
  const [chosen, setChosen] = useState<ThemeName | null>(null);
  const theme = chosen ?? siteTheme;
  const { width, height } = STUDIO_SHOTS[shot];

  return (
    <figure className={cn("not-prose my-8", className)}>
      <div
        className="overflow-hidden rounded-xl border border-(--border-default)"
        style={{
          background: "var(--surface-card)",
          boxShadow: elevated ? "var(--shadow-panel)" : undefined,
        }}
      >
        <PanelCaption>
          <span className="text-xs font-medium text-(--text-muted)">{t("label")}</span>
          <fieldset className="flex gap-1">
            <legend className="sr-only">{t("tablistLabel")}</legend>
            {THEMES.map((id) => {
              const pressed = id === theme;
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={pressed}
                  onClick={() => setChosen(id)}
                  className={cn(
                    THEME_BUTTON_CLASS,
                    pressed
                      ? "bg-(--surface-card) text-(--text-strong)"
                      : "text-(--text-muted) hover:text-(--text-strong)",
                  )}
                >
                  {t(id)}
                </button>
              );
            })}
          </fieldset>
        </PanelCaption>
        <div className={zoomOnPhone ? "vk-shot-zoom" : undefined}>
          <Image
            src={studioShotSrc(shot, theme)}
            alt={alt}
            width={width}
            height={height}
            sizes={zoomOnPhone ? ZOOMED_SIZES : SIZES}
            priority={priority}
            className="block h-auto w-full"
          />
        </div>
      </div>
      {caption ? (
        <figcaption className="mt-3 text-sm leading-relaxed text-(--text-muted)">
          {caption}
        </figcaption>
      ) : null}
    </figure>
  );
}
