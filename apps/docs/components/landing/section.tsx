import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const WIDTHS = {
  content: "vk-w-content",
  wide: "vk-w-wide",
} as const;

const RHYTHM = {
  lg: "vk-rhythm-lg",
  md: "vk-rhythm-md",
  sm: "vk-rhythm-sm",
} as const;

export function Section({
  children,
  width = "wide",
  rhythm = "md",
  className,
  id,
}: {
  children: ReactNode;
  width?: keyof typeof WIDTHS;
  rhythm?: keyof typeof RHYTHM;
  className?: string;
  id?: string;
}): ReactNode {
  return (
    <section id={id} className={cn("vk-gutter mx-auto", WIDTHS[width], RHYTHM[rhythm], className)}>
      {children}
    </section>
  );
}
