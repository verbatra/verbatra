import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "./cn.ts";

export type CardPadding = "none" | "sm" | "md";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  readonly padding?: CardPadding;
  readonly as?: "div" | "section";
}

const PADDING: Readonly<Record<CardPadding, string>> = {
  none: "",
  sm: "p-4",
  md: "p-6",
};

export function Card({
  padding = "md",
  as: Element = "div",
  className,
  ...props
}: CardProps): ReactNode {
  return (
    <Element
      className={cn(
        "rounded-(--radius-lg) border border-(--border-tile) bg-(--surface-tile)",
        PADDING[padding],
        className,
      )}
      data-padding={padding}
      {...props}
    />
  );
}
