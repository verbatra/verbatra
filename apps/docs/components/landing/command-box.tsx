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
      className="not-prose @container flex w-full min-w-0 flex-wrap items-center gap-x-3 gap-y-2 rounded-[10px] border border-fd-border px-4 py-2.5 font-mono text-sm"
      style={{ background: "color-mix(in srgb, var(--v-void) 72%, transparent)" }}
    >
      <span aria-hidden="true" style={{ color: "var(--v-glow)" }}>
        $
      </span>
      <code className="vk-scroll min-w-0 flex-1 overflow-x-auto whitespace-nowrap text-left @max-[30rem]:whitespace-normal text-fd-foreground">
        <HighlightedCommand command={command} link={link} />
      </code>
      <span className="flex @max-[20rem]:basis-full @max-[20rem]:justify-end">
        <CopyButton text={command} label={label} />
      </span>
    </div>
  );
}
