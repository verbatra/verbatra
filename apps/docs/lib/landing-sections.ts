export const LANDING_SECTIONS = [
  "hero",
  "marquee",
  "statement",
  "highlights",
  "playground",
  "features",
  "faq",
  "finalCta",
] as const;

export type LandingSectionId = (typeof LANDING_SECTIONS)[number];
