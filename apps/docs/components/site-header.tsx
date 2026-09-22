"use client";

import {
  SidebarDrawerContent,
  SidebarDrawerOverlay,
  SidebarProvider,
  SidebarTrigger,
  SidebarViewport,
} from "fumadocs-ui/components/sidebar/base";
import { buttonVariants } from "fumadocs-ui/components/ui/button";
import { useHomeLayout } from "fumadocs-ui/layouts/home";
import { useNotebookLayout } from "fumadocs-ui/layouts/notebook";
import { type BaseSlots, LinkItem, type LinkItemType } from "fumadocs-ui/layouts/shared";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

export type HeaderSlots = Pick<BaseSlots, "navTitle" | "searchTrigger" | "languageSelect">;

type IconItem = Extract<LinkItemType, { type: "icon" }>;

const TEXT_LINK =
  "vk-header-link text-sm text-fd-muted-foreground transition-colors hover:text-fd-accent-foreground data-[active=true]:text-fd-primary";

const ICON_BUTTON = cn(
  buttonVariants({ size: "icon-sm", variant: "ghost" }),
  "text-fd-muted-foreground",
);

const DRAWER_ITEM =
  "relative flex flex-row items-center gap-2 rounded-lg p-2 text-start text-fd-muted-foreground transition-colors hover:bg-fd-accent/50 hover:text-fd-accent-foreground/80 data-[active=true]:bg-fd-primary/10 data-[active=true]:text-fd-primary";

const ICON_PROPS = {
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

function SidebarIcon(): ReactNode {
  return (
    <svg {...ICON_PROPS} aria-hidden="true">
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M9 3v18" />
    </svg>
  );
}

function CloseIcon(): ReactNode {
  return (
    <svg {...ICON_PROPS} aria-hidden="true">
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

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

function TextLink({ item, className }: { item: LinkItemType; className: string }): ReactNode {
  if (item.type === "custom") return item.children;
  if (item.type === "menu" || item.type === "icon") return null;
  return (
    <LinkItem item={item} className={className}>
      {item.text}
    </LinkItem>
  );
}

function IconLink({ item, className }: { item: IconItem; className?: string }): ReactNode {
  return (
    <LinkItem item={item} className={cn(ICON_BUTTON, className)} aria-label={item.label}>
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
      <LanguagesIcon className={cn("size-4.5 text-fd-muted-foreground", className)} />
    </slots.languageSelect.root>
  );
}

export type SiteHeaderFrameProps = ComponentProps<"header"> & {
  slots: HeaderSlots;
  navItems: ReadonlyArray<LinkItemType>;
  mobileTrigger: ReactNode;
  trailing?: ReactNode;
};

export function SiteHeaderFrame({
  slots,
  navItems,
  mobileTrigger,
  trailing,
  className,
  ...props
}: SiteHeaderFrameProps): ReactNode {
  const textItems = navItems.filter((item) => !isIconItem(item));
  const iconItems = navItems.filter(isIconItem);
  return (
    <header {...props} className={cn("vk-header sticky flex flex-col backdrop-blur-sm", className)}>
      <div className="flex h-14 items-center gap-2 px-4 md:px-6">
        <div className="flex flex-1 items-center">
          {slots.navTitle ? (
            <slots.navTitle className="inline-flex items-center gap-2.5 font-semibold" />
          ) : null}
        </div>
        {slots.searchTrigger ? (
          <slots.searchTrigger.full
            hideIfDisabled
            className="my-auto w-full max-w-sm rounded-xl ps-2.5 max-md:hidden"
          />
        ) : null}
        <div className="flex flex-1 items-center justify-end md:gap-2">
          <nav className="flex items-center gap-6 empty:hidden max-lg:hidden">
            {textItems.map((item) => (
              <TextLink key={itemKey(item)} item={item} className={TEXT_LINK} />
            ))}
          </nav>
          {iconItems.map((item) => (
            <IconLink key={itemKey(item)} item={item} className="max-lg:hidden" />
          ))}
          <div className="flex items-center md:hidden">
            {slots.searchTrigger ? <slots.searchTrigger.sm hideIfDisabled className="p-2" /> : null}
            {mobileTrigger}
          </div>
          <div className="flex items-center gap-2 max-md:hidden">
            <LanguageSelect slots={slots} />
            {trailing}
          </div>
        </div>
      </div>
    </header>
  );
}

const MOBILE_TRIGGER = cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), "-me-1.5 p-2");

export function DocsSiteHeader(props: ComponentProps<"header">): ReactNode {
  const { slots, navItems, isNavTransparent } = useNotebookLayout();
  const sidebar = slots.sidebar;
  const { open } = sidebar.useSidebar();
  return (
    <SiteHeaderFrame
      id="nd-subnav"
      data-transparent={isNavTransparent && !open}
      {...props}
      className={cn(
        "top-(--fd-docs-row-1) z-10 [grid-area:header] layout:[--fd-header-height:--spacing(14)]",
        props.className,
      )}
      slots={slots}
      navItems={navItems}
      mobileTrigger={
        <sidebar.trigger className={MOBILE_TRIGGER}>
          <SidebarIcon />
        </sidebar.trigger>
      }
      trailing={
        <sidebar.collapseTrigger
          className={cn(
            buttonVariants({ variant: "secondary", size: "icon-sm" }),
            "-me-1.5 rounded-full text-fd-muted-foreground",
          )}
        >
          <SidebarIcon />
        </sidebar.collapseTrigger>
      }
    />
  );
}

export function HomeSiteHeader(props: ComponentProps<"header">): ReactNode {
  const { slots, navItems, menuItems } = useHomeLayout();
  const textItems = menuItems.filter((item) => !isIconItem(item));
  const iconItems = menuItems.filter(isIconItem);
  return (
    <SidebarProvider>
      <SiteHeaderFrame
        id="nd-nav"
        {...props}
        className={cn("top-0 z-40", props.className)}
        slots={slots}
        navItems={navItems}
        mobileTrigger={
          <SidebarTrigger className={MOBILE_TRIGGER}>
            <SidebarIcon />
          </SidebarTrigger>
        }
      />
      <SidebarDrawerOverlay className="fixed inset-0 z-40 backdrop-blur-xs data-[state=closed]:animate-fd-fade-out data-[state=open]:animate-fd-fade-in" />
      <SidebarDrawerContent className="fixed inset-e-0 inset-y-0 z-40 flex w-[85%] max-w-[380px] flex-col border-s bg-fd-background text-[0.9375rem] shadow-lg data-[state=closed]:animate-fd-sidebar-out data-[state=open]:animate-fd-sidebar-in">
        <div className="flex justify-end p-4 pb-2">
          <SidebarTrigger className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }))}>
            <CloseIcon />
          </SidebarTrigger>
        </div>
        <SidebarViewport>
          <div className="flex flex-col gap-0.5 px-4">
            {textItems.map((item) => (
              <TextLink key={itemKey(item)} item={item} className={DRAWER_ITEM} />
            ))}
          </div>
        </SidebarViewport>
        <div className="flex items-center gap-1 border-t p-4 pt-2 text-fd-muted-foreground">
          {iconItems.map((item) => (
            <IconLink key={itemKey(item)} item={item} />
          ))}
          <div className="ms-auto">
            <LanguageSelect slots={slots} />
          </div>
        </div>
      </SidebarDrawerContent>
    </SidebarProvider>
  );
}
