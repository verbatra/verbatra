import type { ReactNode } from "react";
import { cn } from "./cn.ts";

export function Skeleton({ className }: { readonly className?: string }): ReactNode {
  return (
    <span
      className={cn(
        "block rounded-(--radius-md) bg-(--surface-muted) motion-safe:animate-pulse",
        className,
      )}
      aria-hidden="true"
    />
  );
}

export function TableSkeleton({ rows = 4 }: { readonly rows?: number }): ReactNode {
  return (
    <div className="flex flex-col gap-2">
      <Skeleton className="h-6 w-1/3" />
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="h-8 w-full" />
      ))}
    </div>
  );
}
