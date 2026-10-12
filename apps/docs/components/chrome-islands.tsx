"use client";

import { intlIsland, island, preloadOnServer } from "@/lib/island";

export const LanguageSelect = intlIsland(() =>
  import("@/components/language-select").then((m) => m.LocaleAwareLanguageSelect),
);
export const ThemeToggle = intlIsland(() =>
  import("@/components/theme-toggle").then((m) => m.ThemeToggle),
);
export const HomeMobileMenu = island(() =>
  import("@/components/home-mobile-menu").then((m) => m.HomeMobileMenu),
);
export const VersionPill = intlIsland(() =>
  import("@/components/version-pill").then((m) => m.VersionPill),
);

await preloadOnServer([LanguageSelect, ThemeToggle, HomeMobileMenu, VersionPill]);
