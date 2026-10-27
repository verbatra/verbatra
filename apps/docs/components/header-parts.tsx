import type { ReactNode } from "react";

export const HEADER_CLASS = "vk-header sticky flex flex-col backdrop-blur-sm";

export function HeaderRow({ children }: { children: ReactNode }): ReactNode {
  return (
    <div className="vk-header-row mx-auto flex h-14 w-full max-w-(--fd-layout-width) items-center gap-2 px-4 md:px-6">
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
