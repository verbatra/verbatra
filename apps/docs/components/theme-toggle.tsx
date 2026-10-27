"use client";

import { buttonVariants } from "fumadocs-ui/components/ui/button";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { nextTheme } from "@/lib/theme";
import { useSiteTheme } from "@/lib/use-site-theme";
import { cn } from "@/lib/utils";

const ICON_PROPS = {
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

function SunIcon(): ReactNode {
  return (
    <svg {...ICON_PROPS} aria-hidden="true" className="vk-theme-icon vk-theme-icon-light size-4.5">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="m4.93 4.93 1.41 1.41" />
      <path d="m17.66 17.66 1.41 1.41" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="m6.34 17.66-1.41 1.41" />
      <path d="m19.07 4.93-1.41 1.41" />
    </svg>
  );
}

function MoonIcon(): ReactNode {
  return (
    <svg {...ICON_PROPS} aria-hidden="true" className="vk-theme-icon vk-theme-icon-dark size-4.5">
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </svg>
  );
}

export function ThemeToggle({ className }: { className?: string | undefined }): ReactNode {
  const t = useTranslations("docs.theme");
  const { resolvedTheme, setTheme } = useSiteTheme();
  const light = resolvedTheme === "light";
  const label = t("light");
  return (
    <button
      type="button"
      className={cn(
        buttonVariants({ size: "icon-sm", variant: "ghost" }),
        "vk-tap vk-theme-toggle text-(--text-muted)",
        className,
      )}
      aria-label={label}
      aria-pressed={light}
      title={label}
      data-theme-toggle
      onClick={() => setTheme(nextTheme(resolvedTheme))}
    >
      <SunIcon />
      <MoonIcon />
    </button>
  );
}
