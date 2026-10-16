export const LANDING_SECTIONS = [
  "hero",
  "marquee",
  "playground",
  "proofStrip",
  "problem",
  "howItWorks",
  "features",
  "code",
  "showcase",
  "studio",
  "compare",
  "openSource",
  "faq",
  "finalCta",
] as const;

export type LandingSectionId = (typeof LANDING_SECTIONS)[number];
