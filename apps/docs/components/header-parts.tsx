import type { ReactNode } from "react";
import { GithubIcon } from "@/components/landing/github-icon";
import { reservedWidth } from "@/lib/reserved-width";
import { cn } from "@/lib/utils";

export const HEADER_CLASS = "vk-header sticky flex flex-col backdrop-blur-sm";

export const ROW_WIDTH = {
  layout: "max-w-(--fd-layout-width) px-4 md:px-6",
  wide: "max-w-(--width-wide) px-(--gutter)",
} as const;

export type RowWidth = keyof typeof ROW_WIDTH;

export function HeaderRow({ width, children }: { width: RowWidth; children: ReactNode }) {
  return (
    <div
      className={cn("vk-header-row mx-auto flex h-14 w-full items-center gap-2", ROW_WIDTH[width])}
    >
      {children}
    </div>
  );
}

export function HeaderStart({ children }: { children: ReactNode }): ReactNode {
  return <div className="vk-header-start flex flex-1 items-center">{children}</div>;
}

export function HeaderEnd({ children }: { children: ReactNode }): ReactNode {
  return <div className="flex flex-1 items-center justify-end md:gap-2 md:ps-4">{children}</div>;
}

export function HeaderNav({
  label,
  children,
}: {
  label: string | undefined;
  children: ReactNode;
}): ReactNode {
  return (
    <nav aria-label={label} className="flex items-center gap-6 empty:hidden max-md:hidden md:me-4">
      {children}
    </nav>
  );
}

export const WORDMARK_LINK_CLASS = "vk-tap inline-flex items-center gap-2.5 font-semibold";

export function githubLinkClass(className: string): string {
  return cn("inline-flex items-center gap-1.5", className);
}

export function GitHubLinkBody({
  label,
  stars,
  reserved,
  starsSuffix,
}: {
  label: string;
  stars: string | null;
  reserved: string | null;
  starsSuffix: string;
}): ReactNode {
  return (
    <>
      <GithubIcon size={16} />
      <span>{label}</span>
      {stars === null ? null : (
        <>
          {" "}
          <span className="vk-nav-stars" data-stars="" style={reservedWidth(reserved)}>
            {stars}
          </span>
          <span className="sr-only">{starsSuffix}</span>
        </>
      )}
    </>
  );
}

export function MenuIcon(): ReactNode {
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
