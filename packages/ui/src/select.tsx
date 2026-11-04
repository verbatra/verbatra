import type { ReactNode, SelectHTMLAttributes } from "react";
import { cn } from "./cn.ts";
import { FIELD_BASE, FIELD_SIZE, type FieldSize } from "./field.ts";
import { Icon } from "./icon.tsx";

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "size"> {
  readonly size?: FieldSize;
}

const SELECT_PADDING: Readonly<Record<FieldSize, string>> = {
  xs: "pe-7",
  sm: "pe-8",
  md: "pe-10",
};

export function Select({ className, children, size = "sm", ...props }: SelectProps): ReactNode {
  return (
    <span className="relative inline-block">
      <select
        className={cn(
          FIELD_BASE,
          FIELD_SIZE[size],
          SELECT_PADDING[size],
          "w-auto appearance-none",
          className,
        )}
        {...props}
        data-size={size}
      >
        {children}
      </select>
      <span
        className="pointer-events-none absolute inset-y-0 end-2.5 flex items-center text-(--text-muted)"
        aria-hidden="true"
      >
        <Icon name="chevron-down" size={14} />
      </span>
    </span>
  );
}
