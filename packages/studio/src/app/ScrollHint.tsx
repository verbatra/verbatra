import type { ReactNode, RefObject } from "react";
import { cn } from "./lib/cn.js";
import { useHorizontalOverflow } from "./use-horizontal-overflow.js";

export function ScrollHint({
  targetRef,
  className = "mt-2",
}: {
  readonly targetRef: RefObject<HTMLElement | null>;
  readonly className?: string;
}): ReactNode {
  const overflows = useHorizontalOverflow(targetRef);

  return (
    <p
      hidden={!overflows}
      aria-hidden="true"
      className={cn("text-xs text-muted-foreground", className)}
    >
      Scroll sideways to see every column.
    </p>
  );
}
