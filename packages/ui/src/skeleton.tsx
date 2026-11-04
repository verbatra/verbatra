import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "./cn.ts";

export type SkeletonProps = Omit<HTMLAttributes<HTMLSpanElement>, "children">;

export function Skeleton({ className, ...props }: SkeletonProps): ReactNode {
  return (
    <span
      {...props}
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
      <Skeleton data-bar="header" className="h-6 w-1/3" />
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} data-bar="row" className="h-8 w-full" />
      ))}
    </div>
  );
}
