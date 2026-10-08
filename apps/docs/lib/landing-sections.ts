export const LANDING_SECTIONS = [
  "hero",
  "how",
  "control",
  "marquee",
  "loop",
  "faq",
  "finalCta",
] as const;

export type LandingSectionId = (typeof LANDING_SECTIONS)[number];
