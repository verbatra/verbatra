import type { ReactNode, SelectHTMLAttributes } from "react";
import { Icon } from "./Icon.js";
import { cn } from "./lib/cn.js";

export function Select({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>): ReactNode {
  return (
    <span className="relative inline-block">
      <select
        className={cn(
          "block appearance-none rounded-md border border-border bg-input py-2 pe-8 ps-3 text-sm text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <span
        className="pointer-events-none absolute inset-y-0 end-2.5 flex items-center text-muted-foreground"
        aria-hidden="true"
      >
        <Icon name="chevron-down" size={14} />
      </span>
    </span>
  );
}
