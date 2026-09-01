import type { ReactNode } from "react";

export function NewBadge({ children }: { children: ReactNode }): ReactNode {
  return (
    <span
      className="ms-1.5 rounded-full px-1.5 py-0.5 font-mono text-[0.625rem] font-semibold uppercase tracking-wide"
      style={{ background: "var(--v-purple)", color: "hsl(290 60% 96%)" }}
    >
      {children}
    </span>
  );
}
