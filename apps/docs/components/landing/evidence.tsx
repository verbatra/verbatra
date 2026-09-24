import type { ReactNode } from "react";

const EVIDENCE_CLASS =
  "inline-block max-w-full overflow-x-auto whitespace-nowrap rounded-md border border-fd-border px-2.5 py-1.5 font-mono text-[12.5px] text-[color:var(--accent)]";

const EVIDENCE_STYLE = { background: "var(--surface-bg)" } as const;

export function Evidence({ text, href }: { text: string; href?: string | undefined }): ReactNode {
  if (href) {
    const external = href.startsWith("http");
    return (
      <a
        href={href}
        className={EVIDENCE_CLASS}
        style={EVIDENCE_STYLE}
        {...(external ? { target: "_blank", rel: "noreferrer noopener" } : {})}
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
