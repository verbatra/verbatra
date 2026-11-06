import { Skeleton } from "@verbatra/ui";
import type { ReactNode } from "react";

export function PanelSkeleton({
  label,
  layout,
}: {
  readonly label: string;
  readonly layout: "list" | "settings";
}): ReactNode {
  return (
    <div role="status" aria-busy="true" data-skeleton={layout} className="flex flex-col gap-3">
      <span className="sr-only">{label}</span>
      {layout === "list" ? (
        <>
          <Skeleton className="h-9 w-full sm:max-w-[320px]" />
          <Skeleton className="h-20 w-full rounded-(--radius-lg)" />
          <Skeleton className="h-20 w-full rounded-(--radius-lg)" />
          <Skeleton className="h-20 w-full rounded-(--radius-lg)" />
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Skeleton className="h-20 rounded-(--radius-lg)" />
            <Skeleton className="h-20 rounded-(--radius-lg)" />
            <Skeleton className="h-20 rounded-(--radius-lg)" />
            <Skeleton className="h-20 rounded-(--radius-lg)" />
          </div>
          <Skeleton className="h-48 w-full rounded-(--radius-lg)" />
        </>
      )}
    </div>
  );
}
