"use client";

import { CodeBlock } from "fumadocs-ui/components/codeblock";
import type { ComponentProps, MouseEvent, ReactNode } from "react";
import { trackUmamiEvent } from "@/lib/umami";
import { cn } from "@/lib/utils";

type CodeBlockProps = ComponentProps<typeof CodeBlock>;

function trackCopy(event: MouseEvent<HTMLDivElement>): void {
  if (event.target instanceof Element && event.target.closest("button")) {
    trackUmamiEvent("copy-code", { location: "docs-page" });
  }
}

function CopyTrackingActions({
  className,
  children,
}: {
  className?: string;
  children?: ReactNode;
}): ReactNode {
  return (
    <div className={cn("empty:hidden", className)} onClickCapture={trackCopy}>
      {children}
    </div>
  );
}

export function TrackedCodeBlock(props: Omit<CodeBlockProps, "Actions">): ReactNode {
  return <CodeBlock {...props} Actions={CopyTrackingActions} />;
}
