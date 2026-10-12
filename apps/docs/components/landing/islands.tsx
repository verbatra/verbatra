"use client";

import { intlIsland, island, preloadOnServer } from "@/lib/island";

export const CommandPanel = intlIsland(() => import("./command-panel").then((m) => m.CommandPanel));
export const HeroTerminal = island(() => import("./hero-terminal").then((m) => m.HeroTerminal));
export const CodeShowcaseTabs = island(() =>
  import("./code-showcase-tabs").then((m) => m.CodeShowcaseTabs),
);
export const FormatSwitch = island(() => import("./format-switch").then((m) => m.FormatSwitch));
export const TryIt = intlIsland(() => import("./try-it").then((m) => m.TryIt));
export const LiveStatValue = island(() => import("./live-stat-value").then((m) => m.LiveStatValue));
export const FaqAccordion = island(() => import("./faq-accordion").then((m) => m.FaqAccordion));
export const StudioScreenshot = intlIsland(() =>
  import("@/components/studio-screenshot").then((m) => m.StudioScreenshot),
);
export const CommandRow = intlIsland(() =>
  import("@/components/command-row").then((m) => m.CommandRow),
);
export const CopyButton = intlIsland(() =>
  import("@/components/ui/copy-button").then((m) => m.CopyButton),
);

await preloadOnServer([
  CommandPanel,
  HeroTerminal,
  CodeShowcaseTabs,
  FormatSwitch,
  TryIt,
  LiveStatValue,
  FaqAccordion,
  StudioScreenshot,
  CommandRow,
  CopyButton,
]);
