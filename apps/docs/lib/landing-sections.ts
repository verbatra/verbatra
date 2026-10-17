export const LANDING_SECTIONS = [
  "hero",
  "marquee",
  "playground",
  "compare",
  "faq",
  "openSource",
  "finalCta",
] as const;

export type LandingSectionId = (typeof LANDING_SECTIONS)[number];
