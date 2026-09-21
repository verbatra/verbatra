import Link from "next/link";
import type { ComponentPropsWithoutRef, CSSProperties, ReactNode } from "react";

export type ButtonProps = {
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  trailingArrow?: boolean;
  href?: string;
  children: ReactNode;
} & ComponentPropsWithoutRef<"button">;

const BASE =
  "group not-prose inline-flex items-center gap-2 rounded-[10px] font-semibold transition-[filter,background-color,color] disabled:opacity-50 disabled:pointer-events-none";

const VARIANT: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary: "text-[color:var(--accent-fill-fg)] hover:brightness-[1.08]",
  secondary: "border border-fd-border text-fd-foreground hover:bg-fd-accent",
  ghost: "text-fd-muted-foreground hover:text-fd-foreground",
};

const SIZE: Record<NonNullable<ButtonProps["size"]>, string> = {
  sm: "py-[7px] px-3 text-sm",
  md: "py-[11px] px-[18px] text-sm",
  lg: "py-[13px] px-[22px] text-base",
};

export default function Button({
  variant = "primary",
  size = "md",
  disabled = false,
  trailingArrow = false,
  href,
  children,
  className,
  ...rest
}: ButtonProps): ReactNode {
  const classes = `${BASE} ${VARIANT[variant]} ${SIZE[size]}${className ? ` ${className}` : ""}`;
  const style: CSSProperties | undefined =
    variant === "primary" ? { background: "var(--accent-fill)" } : undefined;

  const content = (
    <>
      {children}
      {trailingArrow ? (
        <span aria-hidden="true" className="transition-transform group-hover:translate-x-0.5">
          →
        </span>
      ) : null}
    </>
  );

  if (href && !disabled) {
    return (
      <Link href={href} className={classes} style={style}>
        {content}
      </Link>
    );
  }

  return (
    <button type="button" className={classes} style={style} disabled={disabled} {...rest}>
      {content}
    </button>
  );
}
