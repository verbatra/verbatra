import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type SectionHeadLayout = "split" | "stacked";

export function SectionHead({
  title,
  lead,
  layout = "split",
  id,
}: {
  title: ReactNode;
  lead?: ReactNode;
  layout?: SectionHeadLayout;
  id?: string;
}): ReactNode {
  const split = layout === "split" && lead !== undefined;
  return (
    <div
      className={cn("vk-section-head", split ? "vk-grid-12" : "vk-section-head-stacked")}
      data-layout={split ? "split" : "stacked"}
    >
      <div className="vk-section-head-title">
        <h2 id={id} className={cn("vk-h2", split ? "max-w-[15ch]" : "max-w-[22ch]")}>
          {title}
        </h2>
      </div>
      {lead ? (
        <p
          className={cn(
            "vk-lead vk-section-head-lead",
            split ? "max-w-[46ch] lg:pb-2.5" : "max-w-[56ch]",
          )}
        >
          {lead}
        </p>
      ) : null}
    </div>
  );
}
