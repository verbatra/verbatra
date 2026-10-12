import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type ScrollBlockProps = {
  labelledBy: string;
  children: ReactNode;
  className?: string;
  lang?: "en";
  "data-artifact"?: string;
  "data-check-output"?: boolean;
};

export function ScrollBlock({
  labelledBy,
  children,
  className,
  lang,
  "data-artifact": artifact,
  "data-check-output": checkOutput,
}: ScrollBlockProps): ReactNode {
  return (
    // biome-ignore lint/a11y/useSemanticElements: a fieldset groups form controls; this names a scrolling code block without adding a landmark
    <div
      role="group"
      // biome-ignore lint/a11y/noNoninteractiveTabindex: the block scrolls sideways, so the keyboard needs a stop to scroll it
      tabIndex={0}
      aria-labelledby={labelledBy}
      lang={lang}
      data-artifact={artifact}
      data-check-output={checkOutput}
      className={cn("vk-scroll-fade", className)}
    >
      {children}
    </div>
  );
}
