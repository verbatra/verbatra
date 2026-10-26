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
    <div className="vk-page-actions not-prose flex flex-wrap items-center gap-2 max-md:*:min-h-11">
      <MarkdownCopyButton markdownUrl={markdownUrl} />
      <ViewOptionsPopover markdownUrl={markdownUrl} {...(githubUrl ? { githubUrl } : {})} />
    </div>
  );
}
