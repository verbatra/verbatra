import { Badge, Button, Icon, microLabelClassName } from "@verbatra/ui";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { connectionStore } from "./api.js";
import { ThemeSwitcher } from "./ThemeSwitcher.js";

const DEGRADED_BADGE_DELAY_MS = 1500;

function LiveIndicator(): ReactNode {
  const [status, setStatus] = useState(connectionStore.getStatus());
  const [showDegraded, setShowDegraded] = useState(false);

  useEffect(() => {
    const unsubscribe = connectionStore.subscribe(setStatus);
    setStatus(connectionStore.getStatus());
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (status === "live") {
      setShowDegraded(false);
      return;
    }
    const timer = window.setTimeout(() => setShowDegraded(true), DEGRADED_BADGE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [status]);

  return (
    <span role="status">{showDegraded ? <Badge tone="warning">Reconnecting</Badge> : null}</span>
  );
}

export interface TopBarProps {
  readonly pageLabel: string;
  readonly onOpenNav: () => void;
}

export function TopBar({ pageLabel, onOpenNav }: TopBarProps): ReactNode {
  return (
    <header className="flex h-14 flex-none items-center gap-3 border-b border-border bg-card px-4 md:px-6">
      <Button
        variant="ghost"
        className="p-1.5 md:hidden"
        onClick={onOpenNav}
        aria-label="Open navigation"
      >
        <Icon name="menu" />
      </Button>
      <span className={microLabelClassName}>{pageLabel}</span>
      <div className="ms-auto flex items-center gap-2">
        <LiveIndicator />
        <ThemeSwitcher />
      </div>
    </header>
  );
}
