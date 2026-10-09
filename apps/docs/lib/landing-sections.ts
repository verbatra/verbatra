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

export const HOW_STEP_KEYS = ["configure", "diff", "translate", "verifyWrite"] as const;

export const NUMBERED_SECTIONS = ["showcase", "how", "control", "loop"] as const;

export type NumberedSectionId = (typeof NUMBERED_SECTIONS)[number];

export function sectionNumber(id: NumberedSectionId): string {
  return String(NUMBERED_SECTIONS.indexOf(id) + 1).padStart(2, "0");
}
