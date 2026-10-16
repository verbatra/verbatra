import { type HighlightOptions, highlight } from "fumadocs-core/highlight";
import type { ReactNode } from "react";

export type HighlightLanguage = "bash" | "json" | "ts" | "yaml";

export type HighlightTransformers = NonNullable<HighlightOptions["transformers"]>;

export const LANDING_CODE_THEMES = { light: "github-light", dark: "github-dark" } as const;

export function highlightLandingCode(
  code: string,
  lang: HighlightLanguage,
  transformers: HighlightTransformers = [],
): Promise<ReactNode> {
  return highlight(code.replace(/\n+$/, ""), {
    lang,
    themes: LANDING_CODE_THEMES,
    defaultColor: false,
    transformers,
  });
}
