import { buttonVariants } from "fumadocs-ui/components/ui/button";
import { cn } from "@/lib/utils";

export const NAV_TEXT_LINK =
  "vk-tap vk-header-link whitespace-nowrap text-sm text-(--text-muted) transition-colors hover:text-(--text-strong) data-[active=true]:text-(--accent)";

export const SHEET_ITEM =
  "flex min-h-11 items-center gap-2 rounded-lg px-2 text-start text-(--text-muted) transition-colors hover:bg-(--surface-hover)/50 hover:text-(--text-strong) data-[active=true]:bg-(--accent)/10 data-[active=true]:text-(--accent)";

export const MENU_TRIGGER = cn(
  buttonVariants({ variant: "ghost", size: "icon-sm" }),
  "vk-tap -me-1.5 p-2",
);

export const GET_STARTED_CLASS = "vk-tap vk-nav-cta whitespace-nowrap";

export const GET_STARTED_STYLE = { background: "var(--accent-fill)" } as const;
