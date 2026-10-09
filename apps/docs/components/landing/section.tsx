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
  band = false,
}: {
  children: ReactNode;
  width?: keyof typeof WIDTHS;
  rhythm?: keyof typeof RHYTHM;
  className?: string;
  id?: string;
  band?: boolean;
}): ReactNode {
  if (band) {
    return (
      <section id={id} className={cn("vk-band", className)}>
        <div className={cn("vk-gutter mx-auto", WIDTHS[width])}>{children}</div>
      </section>
    );
  }
  return (
    <section id={id} className={cn("vk-gutter mx-auto", WIDTHS[width], RHYTHM[rhythm], className)}>
      {children}
    </section>
  );
}
