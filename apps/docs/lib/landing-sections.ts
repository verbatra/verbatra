export const LANDING_SECTIONS = [
  "hero",
  "marquee",
  "lockDemo",
  "highlights",
  "features",
  "faq",
  "finalCta",
] as const;

export type LandingSectionId = (typeof LANDING_SECTIONS)[number];
