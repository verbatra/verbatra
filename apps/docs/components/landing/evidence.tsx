import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const EVIDENCE_CLASS =
  "inline-block max-w-full rounded-md border border-fd-border px-2.5 py-1.5 font-mono text-xs text-[color:var(--accent)] [overflow-wrap:anywhere]";

export const EVIDENCE_LINK_CLASS = "vk-evidence-link";

const EVIDENCE_STYLE = { background: "var(--surface-bg)" } as const;

const EXTERNAL_EVIDENCE_PROPS = {
  target: "_blank",
  rel: "noreferrer noopener",
  "data-umami-event": "outbound-link",
  "data-umami-event-target": "evidence",
  "data-umami-event-location": "control",
} as const;

export function Evidence({ text, href }: { text: string; href?: string | undefined }): ReactNode {
  if (href) {
    const external = href.startsWith("http");
    return (
      <a
        href={href}
        className={cn(EVIDENCE_CLASS, EVIDENCE_LINK_CLASS)}
        style={EVIDENCE_STYLE}
        {...(external ? EXTERNAL_EVIDENCE_PROPS : {})}
      >
        {text}
      </a>
    );
  }
  return (
    <code className={EVIDENCE_CLASS} style={EVIDENCE_STYLE}>
      {text}
    </code>
  );
}
