"use client";

import type { ReactNode } from "react";
import { type CommandLineLink, HighlightedCommand } from "@/components/ui/command-line";
import { CopyButton } from "@/components/ui/copy-button";
import { trackUmamiEvent } from "@/lib/umami";
import { cn } from "@/lib/utils";

export function CommandRow({
  command,
  label,
  location,
  link,
  divided = false,
  wrap,
  installManager,
}: {
  command: string;
  label: string;
  location: string;
  link?: CommandLineLink;
  divided?: boolean;
  wrap?: "narrow" | "always";
  installManager?: "npm";
}): ReactNode {
  return (
    <div
      className={cn(
        "flex items-start gap-3 px-3.5 py-3 font-mono text-sm leading-6",
        divided && "border-t",
      )}
      style={divided ? { borderColor: "var(--border-default)" } : undefined}
    >
      <span aria-hidden="true" className="pt-1" style={{ color: "var(--v-glow)" }}>
        $
      </span>
      <code
        className={cn(
          "min-w-0 flex-1 pt-1 text-[color:var(--text-strong)]",
          wrap === "always" ? "whitespace-normal" : "vk-edge-fade whitespace-nowrap",
          wrap === "narrow" && "@max-[30rem]:whitespace-normal",
        )}
      >
        <HighlightedCommand command={command} link={link} />
      </code>
      {installManager ? (
        <CopyButton
          text={command}
          label={label}
          onCopied={() =>
            trackUmamiEvent("copy-install-command", { command, manager: installManager, location })
          }
        />
      ) : (
        <CopyButton text={command} label={label} location={location} />
      )}
    </div>
  );
}
