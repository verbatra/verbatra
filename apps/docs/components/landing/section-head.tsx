import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type SectionHeadLayout = "split" | "stacked" | "inline" | "aside";

const TITLE_MEASURE: Readonly<Record<SectionHeadLayout, string>> = {
  split: "max-w-[15ch]",
  stacked: "max-w-[22ch]",
  inline: "max-w-[16ch]",
  aside: "max-w-[15ch]",
};

const LEAD_MEASURE: Readonly<Record<SectionHeadLayout, string>> = {
  split: "max-w-[46ch] lg:pb-2.5",
  stacked: "max-w-[56ch]",
  inline: "max-w-[44ch]",
  aside: "max-w-[40ch]",
};

function resolvedLayout(layout: SectionHeadLayout, hasLead: boolean): SectionHeadLayout {
  if (layout === "split" && !hasLead) return "stacked";
  return layout;
}

type SectionHeadProps = {
  title: ReactNode;
  lead?: ReactNode;
  id?: string;
};

type SectionHeadLayoutProps =
  | { layout?: Exclude<SectionHeadLayout, "aside">; children?: never }
  | { layout: "aside"; children: ReactNode };

function HeadBlock({
  title,
  lead,
  id,
  shape,
}: SectionHeadProps & { shape: SectionHeadLayout }): ReactNode {
  return (
    <div
      className={cn(
        "vk-section-head",
        shape === "split" ? "vk-grid-12" : "vk-section-head-stacked",
        shape === "inline" && "vk-section-head-inline",
        shape === "aside" && "vk-section-head-aside",
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

export function SectionHead(props: SectionHeadProps & SectionHeadLayoutProps): ReactNode {
  const { title, lead, id } = props;
  if (props.layout === "aside") {
    return (
      <div className="vk-section-aside vk-grid-12">
        <HeadBlock title={title} lead={lead} id={id} shape="aside" />
        <div className="vk-section-aside-content">{props.children}</div>
      </div>
    );
  }
  const shape = resolvedLayout(props.layout ?? "split", lead !== undefined);
  return <HeadBlock title={title} lead={lead} id={id} shape={shape} />;
}
