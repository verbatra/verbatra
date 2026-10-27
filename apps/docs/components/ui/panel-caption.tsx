import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const DENSITY = {
  regular: "py-2.5",
  dense: "py-2",
  control: "min-h-10 py-1.5",
} as const;

export function PanelCaption({
  as: Element = "div",
  density = "regular",
  id,
  className,
  children,
}: {
  as?: "div" | "figcaption";
  density?: keyof typeof DENSITY;
  id?: string;
  className?: string;
  children: ReactNode;
}): ReactNode {
  return (
    <Element
      id={id}
      className={cn(
        "flex items-center justify-between gap-3 border-b border-(--border-default) px-4",
        DENSITY[density],
        className,
      )}
    >
      {children}
    </Element>
  );
}
