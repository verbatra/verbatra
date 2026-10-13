"use client";

import { usePathname } from "fumadocs-core/framework";
import Link from "fumadocs-core/link";
import { buttonVariants } from "fumadocs-ui/components/ui/button";
import { createContext, type ReactNode, use } from "react";
import { GithubIcon } from "@/components/landing/github-icon";
import { GITHUB_URL, RELEASES_URL } from "@/components/landing/links";
import { buttonClasses } from "@/components/ui/button";
import { LIVE_COUNT_SLOT } from "@/lib/live-count";
import { reservedWidth, useLiveCount } from "@/lib/live-stats";
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

export const SHEET_ITEM =
  "flex min-h-11 items-center gap-2 rounded-lg px-2 text-start text-fd-muted-foreground transition-colors hover:bg-fd-accent/50 hover:text-fd-accent-foreground data-[active=true]:bg-fd-primary/10 data-[active=true]:text-fd-primary";

export const MENU_TRIGGER = cn(
  buttonVariants({ variant: "ghost", size: "icon-sm" }),
  "vk-tap -me-1.5 p-2",
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

export function ChangelogNavLink({ className }: { className: string }): ReactNode {
  const { labels } = useHomeNav();
  return (
    <a href={RELEASES_URL} target="_blank" rel="noopener noreferrer" className={className}>
      {labels.changelog}
    </a>
  );
}

function StarCount({
  stars,
  reserved,
  suffix,
}: {
  stars: string;
  reserved: string | null;
  suffix: string;
}): ReactNode {
  return (
    <>
      {" "}
      <span className="vk-nav-stars" data-stars="" style={reservedWidth(reserved)}>
        {stars}
      </span>
      <span className="sr-only">{suffix}</span>
    </>
  );
}

export function GitHubNavLink({ className }: { className: string }): ReactNode {
  const { stars: initialStars, labels, locale } = useHomeNav();
  const stars = useLiveCount("stars", initialStars, locale);
  const starsSuffix = labels.starsAria.split(LIVE_COUNT_SLOT)[1] ?? "";
  return (
    <a
      href={GITHUB_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={cn("inline-flex items-center gap-1.5", className)}
    >
      <GithubIcon size={16} />
      <span>{labels.github}</span>
      {stars === null ? null : (
        <StarCount stars={stars} reserved={initialStars} suffix={starsSuffix} />
      )}
    </a>
  );
}

export function GetStartedLink({
  size = "sm",
  className = "vk-tap vk-nav-cta whitespace-nowrap",
  onNavigate,
}: {
  size?: "sm" | "md";
  className?: string;
  onNavigate?: () => void;
}): ReactNode {
  const { quickstartUrl, labels } = useHomeNav();
  return (
    <Link
      href={quickstartUrl}
      className={buttonClasses("primary", size, className)}
      style={{ background: "var(--accent-fill)" }}
      onClick={onNavigate}
    >
      {labels.getStarted}
    </Link>
  );
}
