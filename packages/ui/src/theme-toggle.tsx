"use client";

import { type ReactNode, useSyncExternalStore } from "react";
import { Button } from "./button.tsx";
import { cn } from "./cn.ts";
import type { ThemeMode, ThemeStore } from "./theme.ts";

const NEXT_MODE: Readonly<Record<ThemeMode, ThemeMode>> = {
  system: "light",
  light: "dark",
  dark: "system",
};

export interface ThemeToggleProps {
  readonly store: ThemeStore;
  readonly label: (current: ThemeMode, next: ThemeMode) => string;
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

export function ThemeToggle({ store, label, className }: ThemeToggleProps): ReactNode {
  const mode = useSyncExternalStore(store.subscribe, store.getMode);
  const next = NEXT_MODE[mode];
  const name = label(mode, next);

  return (
    <Button
      variant="ghost"
      className={cn("p-1.5", className)}
      aria-label={name}
      title={name}
      data-theme-toggle=""
      data-mode={mode}
      onClick={() => store.setMode(next)}
    >
      <ModeIcon mode={mode} />
    </Button>
  );
}
