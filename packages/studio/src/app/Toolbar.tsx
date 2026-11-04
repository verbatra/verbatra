import type { ReactNode } from "react";
import { cn } from "./lib/cn.js";

export function Toolbar({
  children,
  end,
  className,
}: {
  readonly children: ReactNode;
  readonly end?: ReactNode;
  readonly className?: string;
}): ReactNode {
  return (
    <div className={cn("mb-6 flex flex-wrap items-center gap-3", className)}>
      {children}
      {end !== undefined ? (
        <div className="ms-auto flex flex-wrap items-center gap-2">{end}</div>
      ) : null}
    </div>
  );
}

export function FilterBar({
  children,
  label = "Filters",
  className,
}: {
  readonly children: ReactNode;
  readonly label?: string;
  readonly className?: string;
}): ReactNode {
  return (
    <fieldset
      className={cn("relative m-0 mb-6 flex flex-wrap items-center gap-3 border-0 p-0", className)}
    >
      <legend className="sr-only">{label}</legend>
      {children}
    </fieldset>
  );
}
