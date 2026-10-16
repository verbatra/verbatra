import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type SectionHeadLayout = "split" | "stacked" | "inline";

const TITLE_MEASURE: Readonly<Record<SectionHeadLayout, string>> = {
  split: "max-w-[15ch]",
  stacked: "max-w-[22ch]",
  inline: "max-w-[16ch]",
};

const LEAD_MEASURE: Readonly<Record<SectionHeadLayout, string>> = {
  split: "max-w-[46ch] lg:pb-2.5",
  stacked: "max-w-[56ch]",
  inline: "max-w-[44ch]",
};

function resolvedLayout(layout: SectionHeadLayout, hasLead: boolean): SectionHeadLayout {
  if (layout === "split" && !hasLead) return "stacked";
  return layout;
}

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
  const shape = resolvedLayout(layout, lead !== undefined);
  return (
    <div
      className={cn(
        "vk-section-head",
        shape === "split" ? "vk-grid-12" : "vk-section-head-stacked",
        shape === "inline" && "vk-section-head-inline",
      )}
      data-layout={shape}
    >
      <div className="vk-section-head-title">
        <h2 id={id} className={cn("vk-h2", TITLE_MEASURE[shape])}>
          {title}
        </h2>
      </div>
      {lead ? (
        <p className={cn("vk-lead vk-section-head-lead", LEAD_MEASURE[shape])}>{lead}</p>
      ) : null}
    </div>
  );
}
