import type { ReactNode } from "react";
import { type CommandLineLink, HighlightedCommand } from "@/components/ui/command-line";
import { CopyButton } from "@/components/ui/copy-button";
import { cn } from "@/lib/utils";

export function CommandRow({
  command,
  label,
  link,
  divided = false,
  wrap,
}: {
  command: string;
  label: string;
  link?: CommandLineLink;
  divided?: boolean;
  wrap?: "narrow" | "always";
}): ReactNode {
  return (
    <div
      className={cn(
        "flex items-start gap-3 px-3.5 py-3 font-mono text-sm leading-6",
        divided && "border-t",
      )}
      style={divided ? { borderColor: "var(--border-default)" } : undefined}
    >
      <span aria-hidden="true" className="pt-1" style={{ color: "var(--accent)" }}>
        $
      </span>
      <code
        className={cn(
          "min-w-0 flex-1 pt-1 text-(--text-strong)",
          wrap === "always" ? "whitespace-normal" : "vk-edge-fade whitespace-nowrap",
          wrap === "narrow" && "@max-[30rem]:whitespace-normal",
        )}
      >
        <HighlightedCommand command={command} link={link} />
      </code>
      <CopyButton text={command} label={label} />
    </div>
  );
}
