import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function SectionHead({
  title,
  lead,
  align = "left",
  maxWidth = "640px",
  id,
}: {
  title: ReactNode;
  lead?: ReactNode;
  align?: "left" | "center";
  maxWidth?: string;
  id?: string;
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
      <h2
        id={id}
        className={cn(
          "font-semibold text-fd-foreground",
          centered ? "max-w-[18ch]" : "max-w-[15ch]",
        )}
        style={{
          fontFamily: "var(--font-display)",
          letterSpacing: "-0.03em",
          fontSize: "var(--text-h2)",
          lineHeight: 1,
          textWrap: "balance",
        }}
      >
        {title}
      </h2>
      {lead ? (
        <p
          className={cn(
            "max-w-[46ch] text-[17px] leading-relaxed text-fd-muted-foreground",
            !centered && "lg:justify-self-end lg:pb-2.5",
          )}
        >
          {lead}
        </p>
      ) : null}
    </div>
  );
}
