import type { ThemeName } from "@/lib/theme";

export const STUDIO_SHOTS = {
  overview: { width: 2880, height: 1280 },
  review: { width: 2880, height: 1384 },
  translations: { width: 2880, height: 1812 },
} as const;

export type StudioShot = keyof typeof STUDIO_SHOTS;

export function studioShotSrc(shot: StudioShot, theme: ThemeName): string {
  return `/screenshots/studio-${shot}-${theme}.webp`;
}
