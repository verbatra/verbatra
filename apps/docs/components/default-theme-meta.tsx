import type { ReactNode } from "react";
import { DEFAULT_THEME, THEME_COLORS } from "@/lib/theme";

export function DefaultThemeMeta(): ReactNode {
  return (
    <noscript>
      <meta name="theme-color" content={THEME_COLORS[DEFAULT_THEME]} />
      <meta name="color-scheme" content={DEFAULT_THEME} />
    </noscript>
  );
}
