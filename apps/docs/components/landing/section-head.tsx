import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function SectionHead({
  title,
  lead,
  align = "left",
  maxWidth = "640px",
  id,
  reveal = false,
}: {
  title: ReactNode;
  lead?: ReactNode;
  align?: "left" | "center";
  maxWidth?: string;
  id?: string;
  reveal?: boolean;
}): ReactNode {
  const centered = align === "center";
  return (
    <div
      className={cn(
        centered
          ? "mx-auto grid justify-items-center gap-5 text-center"
          : "vk-grid-12 vk-section-head",
      )}
      style={centered ? { maxWidth } : undefined}
    >
      <div
        data-reveal={reveal ? "0" : undefined}
        className={centered ? undefined : "vk-section-head-title"}
      >
        <h2 id={id} className={cn("vk-h2", centered ? "mx-auto max-w-[18ch]" : "max-w-[15ch]")}>
          {title}
        </h2>
      </div>
      {lead ? (
        <p
          data-reveal={reveal ? "1" : undefined}
          className={cn(
            "vk-lead max-w-[46ch]",
            !centered && "vk-section-head-lead lg:justify-self-end lg:pb-2.5",
          )}
        >
          {lead}
        </p>
      ) : null}
    </div>
  );
}
