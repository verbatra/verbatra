import type { ReactNode } from "react";
import { Card } from "./card.tsx";
import { cn } from "./cn.ts";

export function Toast({
  children,
  className,
}: {
  readonly children: ReactNode;
  readonly className?: string;
}): ReactNode {
  return (
    <Card
      padding="sm"
      role="status"
      className={cn(
        "fixed end-6 bottom-6 z-40 flex w-[min(360px,calc(100vw-3rem))] flex-col gap-2 shadow-(--shadow-panel)",
        className,
      )}
    >
      {children}
    </Card>
  );
}
