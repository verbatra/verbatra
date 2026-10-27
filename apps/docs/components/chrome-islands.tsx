"use client";

import { intlIsland, island, preloadIslands } from "@/lib/island";

export const LanguageSelect = intlIsland(() =>
  import("@/components/language-select").then((m) => m.LocaleAwareLanguageSelect),
);
export const ThemeToggle = intlIsland(() =>
  import("@/components/theme-toggle").then((m) => m.ThemeToggle),
);
export const HomeMobileMenu = island(() =>
  import("@/components/home-mobile-menu").then((m) => m.HomeMobileMenu),
);

export const LocaleLinks = island(
  () => import("@/components/locale-links").then((m) => m.LocaleLinks),
  { as: "div" },
);

await preloadIslands([LanguageSelect, ThemeToggle, HomeMobileMenu, LocaleLinks]);
