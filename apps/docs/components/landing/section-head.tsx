import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type SectionStep = { number: string; label: string };

export function SectionHead({
  title,
  lead,
  align = "left",
  maxWidth = "640px",
  id,
  step,
  reveal = false,
}: {
  title: ReactNode;
  lead?: ReactNode;
  align?: "left" | "center";
  maxWidth?: string;
  id?: string;
  step?: SectionStep;
  reveal?: boolean;
}): ReactNode {
  const centered = align === "center";
  return (
    <div
      className={cn(
        "grid gap-5",
        centered
          ? "mx-auto justify-items-center text-center"
          : "lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:items-end lg:gap-x-16",
      )}
      style={centered ? { maxWidth } : undefined}
    >
      <div data-reveal={reveal ? "0" : undefined}>
        {step ? (
          <p className="vk-eyebrow">
            <span className="vk-eyebrow-index">{step.number}</span>
            <span>{step.label}</span>
          </p>
        ) : null}
        <h2 id={id} className={cn("vk-h2", centered ? "mx-auto max-w-[18ch]" : "max-w-[15ch]")}>
          {title}
        </h2>
      </div>
      {lead ? (
        <p
          data-reveal={reveal ? "1" : undefined}
          className={cn("vk-lead max-w-[46ch]", !centered && "lg:justify-self-end lg:pb-2.5")}
        >
          {lead}
        </p>
      ) : null}
    </div>
  );
}
