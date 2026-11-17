export const LANDING_SECTIONS = [
  "hero",
  "marquee",
  "lockDemo",
  "gate",
  "statement",
  "features",
  "highlights",
  "compare",
  "faq",
  "finalCta",
] as const;

export type LandingSectionId = (typeof LANDING_SECTIONS)[number];
