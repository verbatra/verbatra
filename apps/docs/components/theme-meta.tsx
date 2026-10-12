"use client";

import { useTheme } from "fumadocs-ui/provider/base";
import { useEffect } from "react";
import { applyThemeMeta, themeName } from "@/lib/theme";

export function ThemeMeta(): null {
  const { resolvedTheme } = useTheme();
  useEffect(() => {
    if (resolvedTheme === undefined) return;
    applyThemeMeta(document, themeName(resolvedTheme));
  }, [resolvedTheme]);
  return null;
}
