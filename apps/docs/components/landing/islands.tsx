"use client";

import { type IslandOptions, intlIsland, island, preloadIslands } from "@/lib/island";

const BLOCK: IslandOptions = { as: "div" };

export const CommandPanel = intlIsland(
  () => import("./command-panel").then((m) => m.CommandPanel),
  BLOCK,
);
export const HeroDiffMotion = island(
  () => import("./hero-diff-motion").then((m) => m.HeroDiffMotion),
  BLOCK,
);
export const MarqueeMotion = island(
  () => import("./marquee-motion").then((m) => m.MarqueeMotion),
  BLOCK,
);
export const PlaygroundDemo = island(
  () => import("./playground-demo").then((m) => m.PlaygroundDemo),
  BLOCK,
);
export const FlowMotion = island(() => import("./flow-motion").then((m) => m.FlowMotion), BLOCK);
export const FlowTabs = island(() => import("./flow-tabs").then((m) => m.FlowTabs), BLOCK);
export const TryIt = intlIsland(() => import("./try-it").then((m) => m.TryIt), BLOCK);
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
  CommandPanel,
  HeroDiffMotion,
  MarqueeMotion,
  PlaygroundDemo,
  FlowMotion,
  FlowTabs,
  TryIt,
  CommandRow,
  FaqKeys,
  CompareFocus,
  ScrollTop,
  CopyButton,
]);
