export const COPY_SURFACES = ["code-block", "command-row", "ai-prompt", "page-markdown"] as const;

export const CTA_IDS = ["hero-quickstart", "hero-compare"] as const;

export const OUTBOUND_TARGETS = ["github", "npm", "mcp-registry", "other"] as const;

export const OUTBOUND_ORIGINS = ["header", "footer", "landing", "docs", "legal"] as const;

export interface EventProperties {
  readonly copy_code: { readonly surface: (typeof COPY_SURFACES)[number] };
  readonly cta_click: { readonly id: (typeof CTA_IDS)[number]; readonly locale: string };
  readonly outbound_click: {
    readonly target: (typeof OUTBOUND_TARGETS)[number];
    readonly from: (typeof OUTBOUND_ORIGINS)[number];
  };
}

export type EventName = keyof EventProperties;

function umamiTrack(): ((name: string, data: object) => void) | undefined {
  const umami: unknown = Reflect.get(window, "umami");
  if (typeof umami !== "object" || umami === null) return undefined;
  const track: unknown = Reflect.get(umami, "track");
  return typeof track === "function" ? track.bind(umami) : undefined;
}

export function trackEvent<Name extends EventName>(name: Name, data: EventProperties[Name]): void {
  try {
    umamiTrack()?.(name, data);
  } catch {
    return;
  }
}
