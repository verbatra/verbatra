export const LANDING_SECTIONS = [
  "hero",
  "marquee",
  "playground",
  "flow",
  "proofStrip",
  "problem",
  "features",
  "code",
  "compare",
  "openSource",
  "faq",
  "finalCta",
] as const;

export type LandingSectionId = (typeof LANDING_SECTIONS)[number];
