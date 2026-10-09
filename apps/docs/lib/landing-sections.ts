export const LANDING_SECTIONS = [
  "hero",
  "showcase",
  "how",
  "control",
  "marquee",
  "loop",
  "faq",
  "finalCta",
] as const;

export type LandingSectionId = (typeof LANDING_SECTIONS)[number];

export const HOW_STEP_KEYS = ["configure", "diff", "translate", "verifyWrite"] as const;
