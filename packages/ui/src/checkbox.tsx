import type { InputHTMLAttributes, ReactNode } from "react";
import { cn } from "./cn.ts";
import { Icon } from "./icon.tsx";

export interface CheckboxProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "checked"> {
  readonly checked: boolean;
  readonly indeterminate?: boolean;
}

const GLYPH = "vk-check-glyph pointer-events-none absolute inset-0 m-auto text-(--accent-fill-fg)";

export function Checkbox({
  checked,
  indeterminate = false,
  className,
  ...props
}: CheckboxProps): ReactNode {
  return (
    <span className="vk-checkbox relative inline-flex size-4 flex-none align-middle">
      <input
        ref={(element) => {
          if (element !== null) {
            element.indeterminate = indeterminate;
          }
        }}
        type="checkbox"
        checked={checked}
        className={cn(
          "vk-field vk-check peer size-4 cursor-pointer appearance-none rounded-(--radius-sm) border border-(--border-field) bg-(--surface-raised) hover:border-(--text-faint) checked:border-(--accent-fill) checked:bg-(--accent-fill) checked:hover:border-(--accent-fill) indeterminate:border-(--accent-fill) indeterminate:bg-(--accent-fill) indeterminate:hover:border-(--accent-fill) disabled:cursor-default disabled:opacity-60",
          className,
        )}
        {...props}
      />
      {indeterminate ? (
        <svg
          viewBox="0 0 24 24"
          width={12}
          height={12}
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinecap="round"
          className={GLYPH}
          data-glyph="indeterminate"
          aria-hidden="true"
        >
          <path d="M5 12h14" />
        </svg>
      ) : (
        <span className={cn(GLYPH, "hidden size-3 peer-checked:block")} data-glyph="check">
          <Icon name="check" size={12} />
        </span>
      )}
    </span>
  );
}
