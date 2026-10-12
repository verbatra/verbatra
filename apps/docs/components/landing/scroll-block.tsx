import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function ScrollBlock({
  labelledBy,
  className,
  ...rest
}: Omit<ComponentProps<"div">, "role" | "tabIndex"> & { labelledBy: string }): ReactNode {
  return (
    // biome-ignore lint/a11y/useSemanticElements: a fieldset groups form controls; this names a scrolling code block without adding a landmark
    <div
      {...rest}
      role="group"
      // biome-ignore lint/a11y/noNoninteractiveTabindex: the block scrolls sideways, so the keyboard needs a stop to scroll it
      tabIndex={0}
      aria-labelledby={labelledBy}
      className={cn("vk-scroll-fade", className)}
    />
  );
}
