"use client";

import { usePathname } from "fumadocs-core/framework";
import Link from "fumadocs-core/link";
import { buttonVariants } from "fumadocs-ui/components/ui/button";
import type { BaseSlots, LinkItemType } from "fumadocs-ui/layouts/shared";
import { FullSearchTrigger, SearchTrigger } from "fumadocs-ui/layouts/shared/slots/search-trigger";
import { type ComponentProps, createContext, type ReactNode, use, useMemo } from "react";
import {
  HomeMobileMenu,
  LanguageSelect as LanguageSelectIsland,
  ThemeToggle,
} from "@/components/chrome-islands";
import {
  HEADER_CLASS,
  HeaderEnd,
  HeaderNav,
  HeaderRow,
  HeaderStart,
  WORDMARK_LINK_CLASS,
} from "@/components/header-parts";
import { useHomeNav } from "@/components/home-nav";
import { NAV_TEXT_LINK } from "@/components/nav-link-classes";
import { isLinkItemActive, LinkItem } from "@/lib/link-items";
import { cn } from "@/lib/utils";

type HeaderSlots = Pick<BaseSlots, "navTitle" | "searchTrigger" | "languageSelect" | "themeSwitch">;

type IconItem = Extract<LinkItemType, { type: "icon" }>;

const ICON_BUTTON = cn(
  buttonVariants({ size: "icon-sm", variant: "ghost" }),
  "text-(--text-muted)",
);

export const ICON_PROPS = {
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

function LanguagesIcon({ className }: { className?: string }): ReactNode {
  return (
    <svg {...ICON_PROPS} aria-hidden="true" className={className}>
      <path d="m5 8 6 6" />
      <path d="m4 14 6-6 2-3" />
      <path d="M2 5h12" />
      <path d="M7 2h1" />
      <path d="m22 22-5-10-5 10" />
      <path d="M14 18h6" />
    </svg>
  );
}

function isIconItem(item: LinkItemType): item is IconItem {
  return item.type === "icon";
}

function itemKey(item: LinkItemType): string {
  return "url" in item && item.url ? item.url : "custom";
}

type ActiveOverride = (url: string) => boolean | undefined;

function withoutTrailingSlash(path: string): string {
  return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
}

function currentMarker(
  active: boolean,
  url: string,
  pathname: string,
): "page" | "true" | undefined {
  if (!active) return undefined;
  return withoutTrailingSlash(url) === withoutTrailingSlash(pathname) ? "page" : "true";
}

function TextLink({
  item,
  className,
  activeOverride,
}: {
  item: LinkItemType;
  className: string;
  activeOverride?: ActiveOverride | undefined;
}): ReactNode {
  const pathname = usePathname();
  if (item.type === "custom") return item.children;
  if (item.type === "menu" || item.type === "icon") return null;
  const active = activeOverride?.(item.url) ?? isLinkItemActive(item, pathname);
  return (
    <Link
      href={item.url}
      external={item.external}
      className={className}
      data-active={active}
      aria-current={currentMarker(active, item.url, pathname)}
    >
      {item.text}
    </Link>
  );
}

function IconLink({
  item,
  className,
  externalHint,
}: {
  item: IconItem;
  className?: string;
  externalHint?: string | undefined;
}): ReactNode {
  const pathname = usePathname();
  const label = item.external && externalHint ? `${item.label} ${externalHint}` : item.label;
  return (
    <LinkItem
      item={item}
      pathname={pathname}
      className={cn(ICON_BUTTON, className)}
      aria-label={label}
    >
      {item.icon}
    </LinkItem>
  );
}

function LanguageSelect({
  slots,
  className,
}: {
  slots: HeaderSlots;
  className?: string;
}): ReactNode {
  if (!slots.languageSelect) return null;
  return (
    <slots.languageSelect.root>
      <LanguagesIcon className={cn("size-4.5 text-(--text-muted)", className)} />
    </slots.languageSelect.root>
  );
}

type SiteHeaderFrameProps = ComponentProps<"header"> & {
  slots: HeaderSlots;
  navItems: ReadonlyArray<LinkItemType>;
  mobileTrigger: ReactNode;
  trailing?: ReactNode;
  navLabel?: string;
  externalHint?: string | undefined;
  activeOverride?: ActiveOverride;
};

export function SiteHeaderFrame({
  slots,
  navItems,
  mobileTrigger,
  trailing,
  navLabel,
  externalHint,
  activeOverride,
  className,
  ...props
}: SiteHeaderFrameProps): ReactNode {
  const textItems = navItems.filter((item) => !isIconItem(item));
  const iconItems = navItems.filter(isIconItem);
  return (
    <header {...props} className={cn(HEADER_CLASS, className)}>
      <HeaderRow>
        <HeaderStart>
          {slots.navTitle ? <slots.navTitle className={WORDMARK_LINK_CLASS} /> : null}
        </HeaderStart>
        {slots.searchTrigger ? (
          <slots.searchTrigger.full
            hideIfDisabled
            className="vk-header-search my-auto w-full max-w-sm rounded-xl ps-2.5 max-lg:max-w-64 max-md:hidden"
          />
        ) : null}
        <HeaderEnd>
          <HeaderNav label={navLabel}>
            {textItems.map((item) => (
              <TextLink
                key={itemKey(item)}
                item={item}
                className={NAV_TEXT_LINK}
                activeOverride={activeOverride}
              />
            ))}
          </HeaderNav>
          {iconItems.map((item) => (
            <IconLink
              key={itemKey(item)}
              item={item}
              className="max-md:hidden"
              externalHint={externalHint}
            />
          ))}
          <div className="flex items-center md:hidden">
            {slots.searchTrigger ? (
              <slots.searchTrigger.sm hideIfDisabled className="vk-tap p-2" />
            ) : null}
            {mobileTrigger}
          </div>
          <div className="flex items-center gap-2 max-md:hidden">
            <LanguageSelect slots={slots} />
            {slots.themeSwitch ? <slots.themeSwitch /> : null}
            {trailing}
          </div>
        </HeaderEnd>
      </HeaderRow>
    </header>
  );
}

type HomeSiteHeaderProps = ComponentProps<"header"> & {
  wordmark: ReactNode;
  homeUrl: string;
};

const HomeTitleContext = createContext<{ homeUrl: string; wordmark: ReactNode }>({
  homeUrl: "/",
  wordmark: null,
});

function HomeNavTitle(titleProps: ComponentProps<"a">): ReactNode {
  const { homeUrl, wordmark } = use(HomeTitleContext);
  return (
    <Link href={homeUrl} prefetch={false} {...titleProps}>
      {wordmark}
    </Link>
  );
}

const HOME_SLOTS: HeaderSlots = {
  navTitle: HomeNavTitle,
  searchTrigger: { sm: SearchTrigger, full: FullSearchTrigger },
  languageSelect: { root: LanguageSelectIsland, text: () => null },
  themeSwitch: ThemeToggle,
};

export function HomeSiteHeader({ wordmark, homeUrl, ...props }: HomeSiteHeaderProps): ReactNode {
  const { links, labels } = useHomeNav();
  const title = useMemo(() => ({ homeUrl, wordmark }), [homeUrl, wordmark]);
  const settings = (
    <>
      <LanguageSelect slots={HOME_SLOTS} />
      <ThemeToggle />
    </>
  );
  return (
    <HomeTitleContext value={title}>
      <SiteHeaderFrame
        id="nd-nav"
        {...props}
        className={cn("top-0 z-40", props.className)}
        slots={HOME_SLOTS}
        navItems={links}
        navLabel={labels.label}
        externalHint={labels.newTab}
        mobileTrigger={<HomeMobileMenu footer={settings} />}
      />
    </HomeTitleContext>
  );
}
