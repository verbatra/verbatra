import { highlight } from "fumadocs-core/highlight";
import type { ReactNode } from "react";

export type HighlightLanguage = "bash" | "json" | "ts" | "yaml";

export const LANDING_CODE_THEMES = { light: "github-light", dark: "github-dark" } as const;

export function highlightLandingCode(code: string, lang: HighlightLanguage): Promise<ReactNode> {
  return highlight(code.replace(/\n+$/, ""), {
    lang,
    themes: LANDING_CODE_THEMES,
    defaultColor: false,
  });
}
