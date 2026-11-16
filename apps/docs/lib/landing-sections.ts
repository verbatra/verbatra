export const LANDING_SECTIONS = [
  "hero",
  "marquee",
  "lockDemo",
  "gate",
  "highlights",
  "features",
  "compare",
  "faq",
  "finalCta",
] as const;

export type LandingSectionId = (typeof LANDING_SECTIONS)[number];
