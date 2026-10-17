import { useSyncExternalStore } from "react";
import type { ThemeName } from "@/lib/theme";
import { currentTheme, setTheme, subscribeTheme } from "@/lib/theme-store";

function serverTheme(): undefined {
  return undefined;
}

export function useSiteTheme(): {
  resolvedTheme: ThemeName | undefined;
  setTheme: (theme: ThemeName) => void;
} {
  const resolvedTheme = useSyncExternalStore(subscribeTheme, currentTheme, serverTheme);
  return { resolvedTheme, setTheme };
}
