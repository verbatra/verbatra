"use client";

import { type IslandOptions, intlIsland, island, preloadIslands } from "@/lib/island";

const BLOCK: IslandOptions = { as: "div" };

export const HeroTracks = island(() => import("./hero-tracks").then((m) => m.HeroTracks), BLOCK);
export const MarqueeMotion = island(
  () => import("./marquee-motion").then((m) => m.MarqueeMotion),
  BLOCK,
);
export const PlaygroundDemo = island(
  () => import("./playground-demo").then((m) => m.PlaygroundDemo),
  BLOCK,
);
export const CommandRow = intlIsland(
  () => import("@/components/command-row").then((m) => m.CommandRow),
  BLOCK,
);
export const FaqKeys = island(() => import("./faq-keys").then((m) => m.FaqKeys));
export const CompareFocus = island(() => import("./compare-focus").then((m) => m.CompareFocus));
export const ScrollTop = island(() => import("./scroll-top").then((m) => m.ScrollTop), BLOCK);
export const CopyButton = intlIsland(() =>
  import("@/components/ui/copy-button").then((m) => m.CopyButton),
);

await preloadIslands([
  HeroTracks,
  MarqueeMotion,
  PlaygroundDemo,
  CommandRow,
  FaqKeys,
  CompareFocus,
  ScrollTop,
  CopyButton,
]);
