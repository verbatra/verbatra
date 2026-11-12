import Image from "next/image";
import type { ReactNode } from "react";
import { STUDIO_SHOTS, studioShotSrc } from "@/lib/studio-shots";
import { THEMES } from "@/lib/theme";

export const CARD_SHOT_SCALE = 2.9;

const SINGLE_COLUMN_GUTTER = "3.125rem";
const TWO_COLUMN_GUTTER = "6rem";
const THREE_COLUMN_WIDTH = 389;

export function studioCardShotSizes(): string {
  return [
    `(max-width: 46rem) calc((100vw - ${SINGLE_COLUMN_GUTTER}) * ${CARD_SHOT_SCALE})`,
    `(max-width: 67rem) calc((100vw - ${TWO_COLUMN_GUTTER}) / 2 * ${CARD_SHOT_SCALE})`,
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
