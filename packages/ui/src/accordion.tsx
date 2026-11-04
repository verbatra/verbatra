import type { ReactNode } from "react";
import { cn } from "./cn.ts";

export function Accordion({ children }: { readonly children: ReactNode }): ReactNode {
  return <div className="flex flex-col gap-3">{children}</div>;
}

export function AccordionItem({
  summary,
  defaultOpen = false,
  className,
  children,
}: {
  readonly summary: ReactNode;
  readonly defaultOpen?: boolean;
  readonly className?: string;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <details
      open={defaultOpen}
      className={cn(
        "rounded-(--radius-lg) border border-(--border-tile) bg-(--surface-tile) p-4",
        className,
      )}
    >
      <summary className="vk-field cursor-pointer list-none rounded-(--radius-sm) font-mono text-base marker:content-none [&::-webkit-details-marker]:hidden">
        {summary}
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}
