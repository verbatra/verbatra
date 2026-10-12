export const LANDING_SECTIONS = [
  "hero",
  "proofStrip",
  "problem",
  "howItWorks",
  "features",
  "code",
  "showcase",
  "ecosystem",
  "studio",
  "compare",
  "openSource",
  "faq",
  "finalCta",
] as const;

export type LandingSectionId = (typeof LANDING_SECTIONS)[number];
