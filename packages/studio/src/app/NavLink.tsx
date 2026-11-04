import { Icon, type IconName } from "@verbatra/ui";
import type { MouseEvent, ReactNode } from "react";
import { type PageId, pageHash } from "../client/routes.js";
import { cn } from "./lib/cn.js";
import { navigateToPage } from "./use-route.js";

export interface NavLinkProps {
  readonly page: PageId;
  readonly label: string;
  readonly active: boolean;
  readonly count?: number | undefined;
  readonly icon?: IconName | undefined;
  readonly variant: "header" | "drawer";
  readonly onNavigate?: (() => void) | undefined;
}

const FOCUS =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

const HEADER_LINK = cn(
  "relative inline-flex items-center gap-1.5 whitespace-nowrap text-sm text-(--text-muted) transition-colors hover:text-(--text-strong) aria-[current=page]:text-(--accent)",
  "after:pointer-events-none after:absolute after:inset-x-0 after:-bottom-1.5 after:h-px after:bg-(--accent) after:opacity-0 hover:after:opacity-100 aria-[current=page]:after:opacity-100 motion-safe:after:transition-opacity",
  FOCUS,
);

const DRAWER_LINK = cn(
  "flex min-h-11 items-center gap-2 rounded-lg px-2 text-start text-(--text-muted) transition-colors hover:bg-(--surface-hover) hover:text-(--text-strong) aria-[current=page]:bg-(--surface-hover) aria-[current=page]:text-(--accent)",
  FOCUS,
);

function formatCount(count: number): string {
  return count > 99 ? "99+" : String(count);
}

function isPlainLeftClick(event: MouseEvent<HTMLAnchorElement>): boolean {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

export function NavLink({
  page,
  label,
  active,
  count,
  icon,
  variant,
  onNavigate,
}: NavLinkProps): ReactNode {
  const waiting = count !== undefined && count > 0 ? count : undefined;

  function handleClick(event: MouseEvent<HTMLAnchorElement>): void {
    if (event.defaultPrevented || !isPlainLeftClick(event)) {
      return;
    }
    event.preventDefault();
    navigateToPage(page);
    onNavigate?.();
  }

  return (
    <a
      href={pageHash(page)}
      aria-current={active ? "page" : undefined}
      className={variant === "header" ? HEADER_LINK : DRAWER_LINK}
      onClick={handleClick}
    >
      {icon !== undefined ? <Icon name={icon} className="flex-none" /> : null}
      <span>{label}</span>
      {waiting !== undefined ? (
        <>
          <span
            className="rounded-full bg-primary px-1.5 py-px font-mono text-[10px] font-bold tabular-nums text-primary-foreground"
            aria-hidden="true"
          >
            {formatCount(waiting)}
          </span>
          <span className="sr-only">, {waiting} waiting</span>
        </>
      ) : null}
    </a>
  );
}
