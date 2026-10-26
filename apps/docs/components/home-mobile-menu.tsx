"use client";

import { type ReactNode, useRef, useState } from "react";
import { MenuIcon } from "@/components/header-parts";
import {
  ChangelogNavLink,
  DocsNavLink,
  FeaturesNavLink,
  GetStartedLink,
  GitHubNavLink,
  useHomeNav,
} from "@/components/home-nav";
import { MENU_TRIGGER, SHEET_ITEM } from "@/components/nav-link-classes";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/shadcn/sheet";

export function HomeMobileMenu({ footer }: { footer: ReactNode }): ReactNode {
  const { labels } = useHomeNav();
  const [open, setOpen] = useState(false);
  const navRef = useRef<HTMLElement>(null);
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
        onOpenAutoFocus={(event) => {
          const first = navRef.current?.querySelector<HTMLElement>("a[href]");
          if (!first) return;
          event.preventDefault();
          first.focus();
        }}
        className="vk-nav-sheet w-[85%] max-w-[380px] gap-0 text-[0.9375rem]"
      >
        <SheetHeader className="px-4 pt-4 pb-2">
          <SheetTitle className="text-sm font-medium text-(--text-muted)">
            {labels.menuTitle}
          </SheetTitle>
        </SheetHeader>
        <nav ref={navRef} aria-label={labels.label} className="flex flex-col gap-0.5 px-2">
          <FeaturesNavLink className={SHEET_ITEM} onNavigate={close} />
          <DocsNavLink className={SHEET_ITEM} onNavigate={close} />
          <ChangelogNavLink className={SHEET_ITEM} />
          <GitHubNavLink className={SHEET_ITEM} />
        </nav>
        <div className="px-4 pt-3 pb-4">
          <GetStartedLink
            size="md"
            className="vk-tap vk-nav-cta-menu w-full justify-center"
            onNavigate={close}
          />
        </div>
        <SheetFooter className="flex-row items-center justify-end gap-1 border-t border-(--border-default) px-2.5 pt-2 pb-4">
          {footer}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
