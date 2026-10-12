import type { MetadataRoute } from "next";
import { THEME_COLORS } from "@/lib/theme";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "verbatra",
    short_name: "verbatra",
    description: "Check your i18n locale files and translate only the keys that changed.",
    start_url: "/",
    display: "standalone",
    theme_color: THEME_COLORS.dark,
    background_color: THEME_COLORS.dark,
    icons: [
      { src: "/favicon.ico", sizes: "16x16 32x32 48x48 64x64", type: "image/x-icon" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
