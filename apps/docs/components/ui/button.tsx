import { ButtonContent, buttonClasses } from "@verbatra/ui";
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
  const classes = buttonClasses({ variant, size, className });
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
