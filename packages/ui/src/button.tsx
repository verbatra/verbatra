import type { ButtonHTMLAttributes, ReactNode, Ref } from "react";
import { cn } from "./cn.ts";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "outline"
  | "ghost"
  | "secondary-success"
  | "secondary-danger"
  | "danger";

export type ButtonSize = "xs" | "sm" | "md" | "lg";

const BASE =
  "vk-btn group not-prose inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-(--radius-md) font-semibold disabled:opacity-60 disabled:pointer-events-none";

const SECONDARY_LOOK =
  "vk-btn-secondary border border-(--text-faint) bg-(--surface-card) hover:bg-(--surface-hover)";

const VARIANT: Readonly<Record<ButtonVariant, string>> = {
  primary: "vk-btn-primary text-(--accent-fill-fg)",
  secondary: `${SECONDARY_LOOK} text-(--text-strong) hover:border-(--accent)`,
  outline:
    "vk-btn-secondary border border-(--text-faint) bg-transparent text-(--text-strong) hover:border-(--accent) hover:bg-(--surface-hover) aria-pressed:border-(--accent) aria-pressed:bg-(--surface-hover)",
  ghost: "vk-btn-ghost text-(--text-muted) hover:bg-(--surface-hover) hover:text-(--text-strong)",
  "secondary-success": `${SECONDARY_LOOK} text-(--status-success) hover:border-(--status-success) hover:bg-(--status-success-soft)`,
  "secondary-danger": `${SECONDARY_LOOK} text-(--status-danger) hover:border-(--status-danger) hover:bg-(--status-danger-soft)`,
  danger: "vk-btn-danger text-(--status-danger-fg)",
};

const SIZE: Readonly<Record<ButtonSize, string>> = {
  xs: "px-2 py-1 text-xs font-medium",
  sm: "py-[7px] px-3 text-sm",
  md: "py-[11px] px-[18px] text-sm",
  lg: "py-[13px] px-[22px] text-base",
};

const BORDERLESS: ReadonlySet<ButtonVariant> = new Set(["primary", "ghost", "danger"]);

export interface ButtonClassesOptions {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly boxed?: boolean;
  readonly className?: string | undefined;
}

export function buttonClasses({
  variant = "secondary",
  size = "sm",
  boxed = false,
  className,
}: ButtonClassesOptions = {}): string {
  return cn(
    BASE,
    VARIANT[variant],
    boxed && BORDERLESS.has(variant) && "border border-transparent",
    SIZE[size],
    className,
  );
}

export function ButtonContent({
  trailingArrow = false,
  children,
}: {
  readonly trailingArrow?: boolean;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <>
      {children}
      {trailingArrow ? (
        <span
          aria-hidden="true"
          className="motion-safe:transition-transform motion-safe:duration-(--duration-fast) motion-safe:ease-(--ease-standard) motion-safe:group-hover:translate-x-1"
        >
          →
        </span>
      ) : null}
    </>
  );
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly trailingArrow?: boolean;
  readonly ref?: Ref<HTMLButtonElement>;
  readonly children: ReactNode;
}

export function Button({
  variant = "secondary",
  size = "sm",
  trailingArrow = false,
  className,
  type = "button",
  children,
  ...props
}: ButtonProps): ReactNode {
  return (
    <button
      type={type}
      className={buttonClasses({ variant, size, boxed: true, className })}
      {...props}
      data-variant={variant}
      data-size={size}
    >
      <ButtonContent trailingArrow={trailingArrow}>{children}</ButtonContent>
    </button>
  );
}
