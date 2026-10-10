import type { ComponentPropsWithoutRef, CSSProperties, ReactNode } from "react";
import { TrackedLink } from "@/components/ui/tracked-link";
import type { UmamiEvent } from "@/lib/umami";

type ButtonLook = {
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md" | "lg";
  trailingArrow?: boolean;
  className?: string;
  children: ReactNode;
};

type LinkButtonProps = ButtonLook & {
  href: string;
  disabled?: boolean;
  track?: UmamiEvent;
} & Omit<ComponentPropsWithoutRef<"a">, keyof ButtonLook | "href" | "onClick" | "onAuxClick">;

type NativeButtonProps = ButtonLook & {
  href?: undefined;
  track?: undefined;
} & Omit<ComponentPropsWithoutRef<"button">, keyof ButtonLook>;

export type ButtonProps = LinkButtonProps | NativeButtonProps;

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

export function buttonClasses(
  variant: NonNullable<ButtonProps["variant"]> = "primary",
  size: NonNullable<ButtonProps["size"]> = "md",
  className?: string,
): string {
  return `${BASE} ${VARIANT[variant]} ${SIZE[size]}${className ? ` ${className}` : ""}`;
}

function ButtonContent({
  trailingArrow,
  children,
}: {
  trailingArrow: boolean;
  children: ReactNode;
}): ReactNode {
  return (
    <>
      {children}
      {trailingArrow ? (
        <span aria-hidden="true" className="transition-transform group-hover:translate-x-0.5">
          →
        </span>
      ) : null}
    </>
  );
}

function safeAttributes(props: object): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(props).filter(([key]) => key.startsWith("aria-") || key.startsWith("data-")),
  );
}

function isLinkButton(props: ButtonProps): props is LinkButtonProps {
  return typeof props.href === "string";
}

export default function Button(props: ButtonProps): ReactNode {
  const { variant = "primary", size = "md", trailingArrow = false, className, children } = props;
  const classes = buttonClasses(variant, size, className);
  const style: CSSProperties | undefined =
    variant === "primary" ? { background: "var(--accent-fill)" } : undefined;
  const content = <ButtonContent trailingArrow={trailingArrow}>{children}</ButtonContent>;

  if (isLinkButton(props)) {
    const {
      variant: _variant,
      size: _size,
      trailingArrow: _trailingArrow,
      className: _className,
      children: _children,
      href,
      disabled,
      track,
      ...rest
    } = props;
    if (disabled) {
      return (
        <button type="button" {...safeAttributes(rest)} className={classes} style={style} disabled>
          {content}
        </button>
      );
    }
    return (
      <TrackedLink {...rest} href={href} track={track} className={classes} style={style}>
        {content}
      </TrackedLink>
    );
  }

  const {
    variant: _variant,
    size: _size,
    trailingArrow: _trailingArrow,
    className: _className,
    children: _children,
    href: _href,
    track: _track,
    ...rest
  } = props;
  return (
    <button type="button" className={classes} style={style} {...rest}>
      {content}
    </button>
  );
}
