import Image from "next/image";
import type { ReactNode } from "react";
import { STUDIO_SHOTS, studioShotSrc } from "@/lib/studio-shots";
import { THEMES } from "@/lib/theme";

export const CARD_SHOT_SIZES = "(max-width: 63.9375rem) 1px, (max-width: 80rem) 62vw, 760px";

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
      sizes={CARD_SHOT_SIZES}
      className={`vk-deck-shot vk-deck-shot-${theme}`}
    />
  ));
}
