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
      className={centered ? "mx-auto text-center" : "text-left"}
      style={centered ? { maxWidth } : undefined}
    >
      <h2
        id={id}
        className="font-semibold text-fd-foreground"
        style={{
          fontFamily: "var(--font-display)",
          letterSpacing: "var(--tracking-tight)",
          fontSize: "var(--text-h2)",
          lineHeight: 1.15,
        }}
      >
        {title}
      </h2>
      {lead ? (
        <p
          className={cn(
            "mt-4 text-lg leading-relaxed text-fd-muted-foreground",
            centered && "mx-auto",
          )}
          style={{ maxWidth: centered ? maxWidth : "580px" }}
        >
          {lead}
        </p>
      ) : null}
    </div>
  );
}
