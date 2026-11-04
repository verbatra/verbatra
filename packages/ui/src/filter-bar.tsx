import type { ReactNode } from "react";
import { cn } from "./cn.ts";

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
