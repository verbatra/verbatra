"use client";

import { MarkdownCopyButton, ViewOptionsPopover } from "fumadocs-ui/layouts/notebook/page";
import type { ReactNode } from "react";

export function DocsPageActions({
  markdownUrl,
  githubUrl,
}: {
  markdownUrl: string;
  githubUrl?: string | undefined;
}): ReactNode {
  return (
    <div className="not-prose -mt-4 flex flex-wrap items-center gap-2">
      <MarkdownCopyButton markdownUrl={markdownUrl} />
      <ViewOptionsPopover markdownUrl={markdownUrl} {...(githubUrl ? { githubUrl } : {})} />
    </div>
  );
}
