import type { InputHTMLAttributes, ReactNode } from "react";
import { cn } from "./cn.ts";

export interface CheckboxProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "checked"> {
  readonly checked: boolean;
  readonly indeterminate?: boolean;
}

export function Checkbox({
  checked,
  indeterminate = false,
  className,
  ...props
}: CheckboxProps): ReactNode {
  return (
    <input
      ref={(element) => {
        if (element !== null) {
          element.indeterminate = indeterminate;
        }
      }}
      type="checkbox"
      checked={checked}
      className={cn(
        "vk-field size-4 cursor-pointer rounded-(--radius-sm) accent-(--accent-fill) disabled:cursor-default",
        className,
      )}
      {...props}
    />
  );
}
