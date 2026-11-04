"use client";

import { type ReactNode, useState, useSyncExternalStore } from "react";
import { Button } from "./button.tsx";
import { cn } from "./cn.ts";
import type { ResolvedTheme, ThemeMode, ThemeStore } from "./theme.ts";
import { Tooltip } from "./tooltip.tsx";

export function nextThemeMode(
  mode: ThemeMode,
  modes: readonly ThemeMode[],
  system: ResolvedTheme,
): ThemeMode {
  const explicit = modes.filter((candidate) => candidate !== "system");
  const hasSystem = modes.includes("system");
  const opposite: ResolvedTheme = system === "light" ? "dark" : "light";
  if (mode === "system") {
    return explicit.includes(opposite) ? opposite : (explicit[0] ?? "system");
  }
  if (mode === system) {
    return hasSystem ? "system" : (explicit.find((candidate) => candidate !== mode) ?? mode);
  }
  if (explicit.includes(system)) {
    return system;
  }
  return hasSystem ? "system" : (explicit[0] ?? mode);
}

export interface ThemeToggleProps {
  readonly store: ThemeStore;
  readonly label: (current: ThemeMode, next: ThemeMode) => string;
  readonly announce: (mode: ThemeMode) => string;
  readonly className?: string;
}

function Glyph({
  mode,
  children,
}: {
  readonly mode: ThemeMode;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="size-4.5"
      data-icon={mode}
    >
      {children}
    </svg>
  );
}

function ModeIcon({ mode }: { readonly mode: ThemeMode }): ReactNode {
  if (mode === "light") {
    return (
      <Glyph mode={mode}>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2" />
        <path d="M12 20v2" />
        <path d="m4.93 4.93 1.41 1.41" />
        <path d="m17.66 17.66 1.41 1.41" />
        <path d="M2 12h2" />
        <path d="M20 12h2" />
        <path d="m6.34 17.66-1.41 1.41" />
        <path d="m19.07 4.93-1.41 1.41" />
      </Glyph>
    );
  }
  if (mode === "dark") {
    return (
      <Glyph mode={mode}>
        <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
      </Glyph>
    );
  }
  return (
    <Glyph mode={mode}>
      <rect width="20" height="14" x="2" y="3" rx="2" />
      <path d="M8 21h8" />
      <path d="M12 17v4" />
    </Glyph>
  );
}

const SERVER_MODE: ThemeMode = "system";
const SERVER_SYSTEM: ResolvedTheme = "light";

export function ThemeToggle({ store, label, announce, className }: ThemeToggleProps): ReactNode {
  const mode = useSyncExternalStore(store.subscribe, store.getMode, () => SERVER_MODE);
  const [announcement, setAnnouncement] = useState("");
  const system = useSyncExternalStore(store.subscribe, store.getSystem, () => SERVER_SYSTEM);
  const next = nextThemeMode(mode, store.modes, system);
  const name = label(mode, next);

  function cycle(): void {
    store.setMode(next);
    setAnnouncement(announce(next));
  }

  return (
    <span className="relative inline-flex">
      <Tooltip label={name} side="bottom-end">
        <Button
          variant="ghost"
          className={cn("p-1.5 max-md:min-h-11 max-md:min-w-11", className)}
          aria-label={name}
          data-theme-toggle=""
          data-mode={mode}
          onClick={cycle}
        >
          <ModeIcon mode={mode} />
        </Button>
      </Tooltip>
      <span role="status" aria-live="polite" className="sr-only">
        {announcement}
      </span>
    </span>
  );
}
