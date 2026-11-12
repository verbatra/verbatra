import Image from "next/image";
import type { ReactNode } from "react";
import { STUDIO_SHOTS, studioShotSrc } from "@/lib/studio-shots";
import { THEMES } from "@/lib/theme";

export const CARD_SHOT_SCALE = 2.9;

const THREE_COLUMN_WIDTH = 389;

const SIZE_STEPS = [
  { below: "43.9375rem", inset: "50px", columns: 1 },
  { below: "47.9375rem", inset: "68px", columns: 2 },
  { below: "66.9375rem", inset: "100px", columns: 2 },
  { below: "80.3125rem", inset: "118px", columns: 3 },
] as const;

export function studioCardShotSizes(): string {
  return [
    ...SIZE_STEPS.map(
      ({ below, inset, columns }) =>
        `(max-width: ${below}) calc((100vw - ${inset}) / ${columns} * ${CARD_SHOT_SCALE})`,
    ),
    `${Math.round(THREE_COLUMN_WIDTH * CARD_SHOT_SCALE)}px`,
  ].join(", ");
}

export function StudioCardShot(): ReactNode {
  const { width, height } = STUDIO_SHOTS.overview;
  return THEMES.map((theme) => (
    <Image
      key={theme}
      src={studioShotSrc("overview", theme)}
      alt=""
      aria-hidden="true"
      width={width}
      height={height}
      sizes={studioCardShotSizes()}
      className={`vk-feature-shot vk-feature-shot-${theme}`}
    />
  ));
}
