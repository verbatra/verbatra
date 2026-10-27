import type { ReactNode } from "react";

export const NEW_PILL_CLASS = "vk-pill-new";

export function NewPill({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}): ReactNode {
  return (
    <span className={className ? `${NEW_PILL_CLASS} ${className}` : NEW_PILL_CLASS}>
      <span aria-hidden="true" className="vk-pill-new-ring" />
      <span aria-hidden="true" className="vk-pill-new-shimmer" />
      {children}
    </span>
  );
}
