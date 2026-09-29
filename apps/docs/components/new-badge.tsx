import type { ReactNode } from "react";

export const PILL_CLASS = "vk-pill";

export function NewBadge({ children }: { children: ReactNode }): ReactNode {
  return <span className={`${PILL_CLASS} vk-pill-status ms-1.5 shrink-0`}>{children}</span>;
}
