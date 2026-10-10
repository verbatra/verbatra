import type { ReactNode } from "react";
import { type CommandLineLink, HighlightedCommand } from "@/components/ui/command-line";
import { CopyButton } from "@/components/ui/copy-button";
import { cn } from "@/lib/utils";

export function CommandBox({
  command,
  label,
  location,
  link,
  scrolls = false,
}: {
  command: string;
  label: string;
  location: string;
  link?: CommandLineLink;
  scrolls?: boolean;
}): ReactNode {
  return (
    <div
      className={cn(
        "not-prose flex w-full min-w-0 items-center gap-x-3 rounded-[10px] border border-fd-border px-4 py-2.5 font-mono text-sm",
        !scrolls && "@container flex-wrap gap-y-2",
      )}
      style={{ background: "color-mix(in srgb, var(--v-void) 72%, transparent)" }}
    >
      <span aria-hidden="true" style={{ color: "var(--v-glow)" }}>
        $
      </span>
      <code
        className={cn(
          "min-w-0 flex-1 whitespace-nowrap text-left text-fd-foreground",
          scrolls
            ? "vk-edge-fade [&_wbr]:hidden"
            : "vk-scroll overflow-x-auto @max-[30rem]:whitespace-normal",
        )}
      >
        <HighlightedCommand command={command} link={link} />
      </code>
      <span className={cn("flex", !scrolls && "@max-[20rem]:basis-full @max-[20rem]:justify-end")}>
        <CopyButton text={command} label={label} location={location} />
      </span>
    </div>
  );
}
