"use client";

import { usePathname } from "fumadocs-core/framework";
import Link from "fumadocs-core/link";
import { createContext, type ReactNode, use } from "react";
import { GitHubLinkBody, githubLinkClass } from "@/components/header-parts";
import { GITHUB_URL, RELEASES_URL } from "@/components/landing/links";
import { GET_STARTED_CLASS, GET_STARTED_STYLE } from "@/components/nav-link-classes";
import { buttonClasses } from "@/components/ui/button";
import { LIVE_COUNT_SLOT } from "@/lib/live-count";
import { useLiveCount } from "@/lib/live-stats";

type HomeNavLabels = {
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

export function GitHubNavLink({ className }: { className: string }): ReactNode {
  const { stars: initialStars, labels, locale } = useHomeNav();
  const stars = useLiveCount("stars", initialStars, locale);
  const starsSuffix = labels.starsAria.split(LIVE_COUNT_SLOT)[1] ?? "";
  return (
    <a
      href={GITHUB_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={githubLinkClass(className)}
    >
      <GitHubLinkBody
        label={labels.github}
        stars={stars}
        reserved={initialStars}
        starsSuffix={starsSuffix}
      />
    </a>
  );
}

export function GetStartedLink({
  size = "sm",
  className = GET_STARTED_CLASS,
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
      style={GET_STARTED_STYLE}
      onClick={onNavigate}
    >
      {labels.getStarted}
    </Link>
  );
}
