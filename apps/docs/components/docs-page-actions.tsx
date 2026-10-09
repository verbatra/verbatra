"use client";

import { MarkdownCopyButton, ViewOptionsPopover } from "fumadocs-ui/layouts/notebook/page";
import type { MouseEvent, ReactNode } from "react";
import { trackUmamiEvent } from "@/lib/umami";

export const COPY_MARKDOWN_EVENT = {
  "data-umami-event": "copy-page-markdown",
  "data-umami-event-location": "docs-page",
} as const;

function trackOptionsOpening(event: MouseEvent<HTMLButtonElement>): void {
  if (event.currentTarget.dataset.state === "open") return;
  trackUmamiEvent("open-page-options", { location: "docs-page" });
}

export function DocsPageActions({
  markdownUrl,
  githubUrl,
}: {
  markdownUrl: string;
  githubUrl?: string | undefined;
}): ReactNode {
  return (
    <div className="not-prose -mt-4 flex flex-wrap items-center gap-2">
      <MarkdownCopyButton markdownUrl={markdownUrl} {...COPY_MARKDOWN_EVENT} />
      <ViewOptionsPopover
        markdownUrl={markdownUrl}
        {...(githubUrl ? { githubUrl } : {})}
        onClick={trackOptionsOpening}
      />
    </div>
  );
}
