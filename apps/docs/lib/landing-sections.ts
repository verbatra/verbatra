export const LANDING_SECTIONS = [
  "hero",
  "marquee",
  "showcase",
  "how",
  "control",
  "loop",
  "faq",
  "finalCta",
] as const;

export type LandingSectionId = (typeof LANDING_SECTIONS)[number];

export const HOW_STEP_KEYS = ["configure", "diff", "translate", "verifyWrite"] as const;
