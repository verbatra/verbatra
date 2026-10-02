import type { InputHTMLAttributes, ReactNode } from "react";
import { cn } from "./lib/cn.js";

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
        "size-4 cursor-pointer rounded-sm accent-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-default",
        className,
      )}
      {...props}
    />
  );
}
