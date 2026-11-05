import type { FieldsetHTMLAttributes, ReactNode } from "react";
import { cn } from "./cn.ts";

export function FilterBar({
  children,
  label = "Filters",
  className,
  ...props
}: Omit<FieldsetHTMLAttributes<HTMLFieldSetElement>, "children"> & {
  readonly children: ReactNode;
  readonly label?: string;
}): ReactNode {
  return (
    <fieldset
      className={cn("relative m-0 mb-6 flex flex-wrap items-center gap-3 border-0 p-0", className)}
      {...props}
    >
      <legend className="sr-only">{label}</legend>
      {children}
    </fieldset>
  );
}
