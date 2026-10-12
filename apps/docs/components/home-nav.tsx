"use client";

import { usePathname } from "fumadocs-core/framework";
import Link from "fumadocs-core/link";
import { buttonVariants } from "fumadocs-ui/components/ui/button";
import { createContext, type ReactNode, use, useState } from "react";
import { GithubIcon } from "@/components/landing/github-icon";
import { GITHUB_URL, RELEASES_URL } from "@/components/landing/links";
import { buttonClasses } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/shadcn/sheet";
import { fillCount } from "@/lib/live-count";
import { reservedWidth, useLiveCount } from "@/lib/live-stats";
import { trackUmamiEvent } from "@/lib/umami";
import { cn } from "@/lib/utils";

export type HomeNavLabels = {
  readonly label: string;
  readonly docs: string;
  readonly github: string;
  readonly starsAria: string;
  readonly changelog: string;
  readonly getStarted: string;
  readonly menuOpen: string;
  readonly menuClose: string;
  readonly menuTitle: string;
};

export type HomeNavValue = {
  readonly docsUrl: string;
  readonly quickstartUrl: string;
  readonly locale: string;
  readonly stars: string | null;
  readonly labels: HomeNavLabels;
};

const HomeNavContext = createContext<HomeNavValue | null>(null);

export function HomeNavProvider({
  value,
  children,
}: {
  value: HomeNavValue;
  children: ReactNode;
}): ReactNode {
  return <HomeNavContext value={value}>{children}</HomeNavContext>;
}

export function useHomeNav(): HomeNavValue {
  const value = use(HomeNavContext);
  if (!value) throw new Error("HomeSiteHeader needs a HomeNavProvider");
  return value;
}

export const NAV_TEXT_LINK =
  "vk-header-link whitespace-nowrap text-sm text-fd-muted-foreground transition-colors hover:text-fd-accent-foreground data-[active=true]:text-fd-primary";

const SHEET_ITEM =
  "flex min-h-11 items-center gap-2 rounded-lg px-2 text-start text-fd-muted-foreground transition-colors hover:bg-fd-accent/50 hover:text-fd-accent-foreground data-[active=true]:bg-fd-primary/10 data-[active=true]:text-fd-primary";

export const MENU_TRIGGER = cn(
  buttonVariants({ variant: "ghost", size: "icon-sm" }),
  "-me-1.5 p-2",
);

function withoutTrailingSlash(path: string): string {
  return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
}

export function docsLinkState(
  docsUrl: string,
  pathname: string,
): { active: boolean; current: "page" | "true" | undefined } {
  const docs = withoutTrailingSlash(docsUrl);
  const path = withoutTrailingSlash(pathname);
  if (path === docs) return { active: true, current: "page" };
  if (path.startsWith(`${docs}/`)) return { active: true, current: "true" };
  return { active: false, current: undefined };
}

function trackOutbound(target: string, location: string): void {
  trackUmamiEvent("outbound-link", { target, location });
}

export function DocsNavLink({
  className,
  onNavigate,
}: {
  className: string;
  onNavigate?: () => void;
}): ReactNode {
  const { docsUrl, labels } = useHomeNav();
  const { active, current } = docsLinkState(docsUrl, usePathname());
  return (
    <Link
      href={docsUrl}
      className={className}
      data-active={active}
      aria-current={current}
      onClick={onNavigate}
    >
      {labels.docs}
    </Link>
  );
}

export function ChangelogNavLink({
  className,
  location,
}: {
  className: string;
  location: string;
}): ReactNode {
  const { labels } = useHomeNav();
  return (
    <a
      href={RELEASES_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      onClick={() => trackOutbound("changelog", location)}
    >
      {labels.changelog}
    </a>
  );
}

export function GitHubNavLink({
  className,
  location,
}: {
  className: string;
  location: string;
}): ReactNode {
  const { stars: initialStars, labels, locale } = useHomeNav();
  const stars = useLiveCount("stars", initialStars, locale);
  return (
    <a
      href={GITHUB_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={cn("inline-flex items-center gap-1.5", className)}
      aria-label={stars === null ? undefined : fillCount(labels.starsAria, stars)}
      onClick={() => trackOutbound("github", location)}
    >
      <GithubIcon size={16} />
      <span>{labels.github}</span>
      {stars === null ? null : (
        <span className="vk-nav-stars" data-stars="" style={reservedWidth(initialStars)}>
          {stars}
        </span>
      )}
    </a>
  );
}

export function GetStartedLink({
  location = "header",
  className = "vk-nav-cta whitespace-nowrap",
  onNavigate,
}: {
  location?: "header" | "menu";
  className?: string;
  onNavigate?: () => void;
}): ReactNode {
  const { quickstartUrl, labels } = useHomeNav();
  return (
    <Link
      href={quickstartUrl}
      className={buttonClasses("primary", location === "menu" ? "md" : "sm", className)}
      style={{ background: "var(--accent-fill)" }}
      onClick={() => {
        trackUmamiEvent("click-cta", { location, target: "get-started" });
        onNavigate?.();
      }}
    >
      {labels.getStarted}
    </Link>
  );
}

function MenuIcon(): ReactNode {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 6h16" />
      <path d="M4 12h16" />
      <path d="M4 18h16" />
    </svg>
  );
}

export function HomeMobileMenu({ footer }: { footer: ReactNode }): ReactNode {
  const { labels } = useHomeNav();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger className={MENU_TRIGGER} aria-label={labels.menuOpen}>
        <MenuIcon />
      </SheetTrigger>
      <SheetContent
        side="right"
        closeLabel={labels.menuClose}
        aria-describedby={undefined}
        className="vk-nav-sheet w-[85%] max-w-[380px] gap-0 text-[0.9375rem]"
      >
        <SheetHeader className="px-4 pt-4 pb-2">
          <SheetTitle className="text-sm font-medium text-fd-muted-foreground">
            {labels.menuTitle}
          </SheetTitle>
        </SheetHeader>
        <nav aria-label={labels.label} className="flex flex-col gap-0.5 px-2">
          <DocsNavLink className={SHEET_ITEM} onNavigate={close} />
          <ChangelogNavLink className={SHEET_ITEM} location="menu" />
          <GitHubNavLink className={SHEET_ITEM} location="menu" />
        </nav>
        <div className="px-4 pt-3 pb-4">
          <GetStartedLink
            location="menu"
            className="vk-nav-cta-menu w-full justify-center"
            onNavigate={close}
          />
        </div>
        <SheetFooter className="flex-row items-center justify-end gap-1 border-t border-fd-border px-2.5 pt-2 pb-4">
          {footer}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
