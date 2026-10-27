"use client";

import { usePathname } from "fumadocs-core/framework";
import Link from "fumadocs-core/link";
import type { LinkItemType } from "fumadocs-ui/layouts/shared";
import { createContext, type ReactNode, use } from "react";
import { navLinks } from "@/lib/header-links";
import { isLinkItemActive } from "@/lib/link-items";

type HomeNavLabels = {
  readonly label: string;
  readonly menuOpen: string;
  readonly menuClose: string;
  readonly menuTitle: string;
  readonly newTab: string;
};

export type HomeNavValue = {
  readonly links: ReadonlyArray<LinkItemType>;
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

export function MenuLinks({
  className,
  onNavigate,
}: {
  className: string;
  onNavigate?: () => void;
}): ReactNode {
  const { links, labels } = useHomeNav();
  const pathname = usePathname();
  return navLinks(links).map(({ href, text, external, active: mode }) => {
    const active = isLinkItemActive({ text, url: href, external, active: mode }, pathname);
    return (
      <Link
        key={href}
        href={href}
        external={external}
        className={className}
        data-active={active}
        aria-current={active ? "page" : undefined}
        onClick={external ? undefined : onNavigate}
      >
        {text}
        {external ? <span className="sr-only"> {labels.newTab}</span> : null}
      </Link>
    );
  });
}
