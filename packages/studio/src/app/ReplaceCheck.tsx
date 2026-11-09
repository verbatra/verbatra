import { Checkbox } from "@verbatra/ui";
import type { ReactNode } from "react";
import { useId } from "react";

export function ReplaceCheck({
  checked,
  disabled = false,
  onChange,
  children,
  ...dataAttributes
}: {
  readonly checked: boolean;
  readonly disabled?: boolean;
  readonly onChange: (checked: boolean) => void;
  readonly children: ReactNode;
  readonly [dataAttribute: `data-${string}`]: string;
}): ReactNode {
  const id = useId();
  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer items-start gap-2 text-sm text-foreground max-md:min-h-11 max-md:items-center"
      data-replace-check-row=""
    >
      <Checkbox
        id={id}
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        {...dataAttributes}
      />
      <span className="min-w-0 wrap-anywhere">{children}</span>
    </label>
  );
}
