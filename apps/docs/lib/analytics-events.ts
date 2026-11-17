import type { Locale } from "@/lib/locales";

export const COPY_SURFACES = ["code-block", "command-row", "ai-prompt", "page-markdown"] as const;

export const CTA_IDS = ["hero-quickstart", "hero-compare"] as const;

export const OUTBOUND_TARGETS = ["github", "npm", "mcp-registry", "other"] as const;

export interface EventProperties {
  readonly copy_code: { readonly surface: (typeof COPY_SURFACES)[number] };
  readonly cta_click: { readonly id: (typeof CTA_IDS)[number] };
  readonly outbound_click: { readonly dest: (typeof OUTBOUND_TARGETS)[number] };
  readonly search_open: undefined;
  readonly mcp_install_click: undefined;
  readonly locale_switch: { readonly to: Locale };
}

export type EventName = keyof EventProperties;

export type ReportedEvent = {
  [Name in EventName]: EventProperties[Name] extends undefined
    ? readonly [name: Name]
    : readonly [name: Name, properties: EventProperties[Name]];
}[EventName];
