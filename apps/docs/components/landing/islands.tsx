"use client";

import { type IslandOptions, intlIsland, island, preloadIslands } from "@/lib/island";

const BLOCK: IslandOptions = { as: "div" };

export const CommandPanel = intlIsland(
  () => import("./command-panel").then((m) => m.CommandPanel),
  BLOCK,
);
export const HeroTerminal = island(
  () => import("./hero-terminal").then((m) => m.HeroTerminal),
  BLOCK,
);
export const CodeShowcaseTabs = island(
  () => import("./code-showcase-tabs").then((m) => m.CodeShowcaseTabs),
  BLOCK,
);
export const FormatSwitch = island(
  () => import("./format-switch").then((m) => m.FormatSwitch),
  BLOCK,
);
export const TryIt = intlIsland(() => import("./try-it").then((m) => m.TryIt), BLOCK);
export const LiveStatValue = island(() => import("./live-stat-value").then((m) => m.LiveStatValue));
export const LiveStatFallback = island(() =>
  import("./live-stat-value").then((m) => m.LiveStatFallback),
);
export const FaqAccordion = island(
  () => import("./faq-accordion").then((m) => m.FaqAccordion),
  BLOCK,
);
export const StudioScreenshot = intlIsland(
  () => import("@/components/studio-screenshot").then((m) => m.StudioScreenshot),
  BLOCK,
);
export const CommandRow = intlIsland(
  () => import("@/components/command-row").then((m) => m.CommandRow),
  BLOCK,
);
export const CopyButton = intlIsland(() =>
  import("@/components/ui/copy-button").then((m) => m.CopyButton),
);

await preloadIslands([
  CommandPanel,
  HeroTerminal,
  CodeShowcaseTabs,
  FormatSwitch,
  TryIt,
  LiveStatValue,
  LiveStatFallback,
  FaqAccordion,
  StudioScreenshot,
  CommandRow,
  CopyButton,
]);
