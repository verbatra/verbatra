export const LANDING_SECTIONS = [
  "hero",
  "marquee",
  "showcase",
  "how",
  "formats",
  "control",
  "loop",
  "faq",
  "finalCta",
] as const;

export type LandingSectionId = (typeof LANDING_SECTIONS)[number];

export const LANDING_NAV_SECTIONS = ["showcase", "how", "formats", "control", "faq"] as const;

export const HOW_STEP_KEYS = ["setup", "translate", "check"] as const;

export type HowStepKey = (typeof HOW_STEP_KEYS)[number];
