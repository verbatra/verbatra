import type { ReactNode } from "react";
import { type CommandLineLink, HighlightedCommand } from "@/components/ui/command-line";
import { CopyButton } from "@/components/ui/copy-button";

export function CommandBox({
  command,
  label,
  link,
}: {
  command: string;
  label: string;
  link?: CommandLineLink;
}): ReactNode {
  return (
    <div
      className="not-prose flex w-full min-w-0 items-center gap-3 rounded-[10px] border border-fd-border px-4 py-2.5 font-mono text-sm"
      style={{ background: "color-mix(in srgb, var(--v-void) 72%, transparent)" }}
    >
      <span aria-hidden="true" style={{ color: "var(--v-glow)" }}>
        $
      </span>
      <code className="vk-scroll min-w-0 flex-1 overflow-x-auto whitespace-nowrap text-left text-fd-foreground">
        <HighlightedCommand command={command} link={link} />
      </code>
      <CopyButton text={command} label={label} />
    </div>
  );
}
