import Link from "fumadocs-core/link";
import type { LinkItemType } from "fumadocs-ui/layouts/shared";
import type { ComponentProps, ReactNode } from "react";

type UrlLinkItem = Extract<LinkItemType, { url: string }>;

function withoutTrailingSlash(path: string): string {
  return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
}

export function isLinkItemActive(item: LinkItemType, pathname: string): boolean {
  if (item.type === "custom" || !("url" in item) || !item.url) return false;
  if (item.active === "none") return false;
  const href = withoutTrailingSlash(item.url);
  const path = withoutTrailingSlash(pathname);
  return href === path || (item.active === "nested-url" && path.startsWith(`${href}/`));
}

export function LinkItem({
  item,
  pathname,
  children,
  ...props
}: ComponentProps<"a"> & { item: UrlLinkItem; pathname: string }): ReactNode {
  return (
    <Link
      href={item.url}
      external={item.external}
      {...props}
      data-active={isLinkItemActive(item, pathname)}
    >
      {children}
    </Link>
  );
}
