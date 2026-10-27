import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { IntentPrefetchLink } from "@/components/ui/intent-prefetch-link";

type ButtonLook = {
  variant?: "primary" | "secondary" | "outline" | "ghost";
  size?: "sm" | "md" | "lg";
  trailingArrow?: boolean;
  className?: string;
  children: ReactNode;
};

type LinkButtonProps = ButtonLook & {
  href: string;
  disabled?: boolean;
} & Omit<ComponentPropsWithoutRef<"a">, keyof ButtonLook | "href">;

type NativeButtonProps = ButtonLook & {
  href?: undefined;
} & Omit<ComponentPropsWithoutRef<"button">, keyof ButtonLook>;

type ButtonProps = LinkButtonProps | NativeButtonProps;

const BASE =
  "vk-btn group not-prose inline-flex items-center gap-2 rounded-[10px] font-semibold disabled:opacity-50 disabled:pointer-events-none";

const VARIANT: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary: "vk-btn-primary text-(--accent-fill-fg)",
  secondary:
    "vk-btn-secondary border border-(--text-faint) bg-(--surface-card) text-(--text-strong) hover:border-(--accent) hover:bg-(--surface-hover)",
  outline:
    "vk-btn-secondary border border-(--text-faint) bg-transparent text-(--text-strong) hover:border-(--accent) hover:bg-(--surface-hover) aria-pressed:border-(--accent) aria-pressed:bg-(--surface-hover)",
  ghost: "vk-btn-ghost text-(--text-muted) hover:bg-(--surface-hover) hover:text-(--text-strong)",
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
      ...rest
    } = props;
    if (disabled) {
      return (
        <button type="button" {...safeAttributes(rest)} className={classes} disabled>
          {content}
        </button>
      );
    }
    return (
      <IntentPrefetchLink {...rest} href={href} className={classes}>
        {content}
      </IntentPrefetchLink>
    );
  }

  const {
    variant: _variant,
    size: _size,
    trailingArrow: _trailingArrow,
    className: _className,
    children: _children,
    href: _href,
    ...rest
  } = props;
  return (
    <button type="button" className={classes} {...rest}>
      {content}
    </button>
  );
}
