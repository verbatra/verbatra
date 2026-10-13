"use client";

import { CodeBlock } from "fumadocs-ui/components/codeblock";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

type CodeBlockProps = ComponentProps<typeof CodeBlock>;

function CodeBlockActions({
  className,
  children,
}: {
  className?: string;
  children?: ReactNode;
}): ReactNode {
  return <div className={cn("empty:hidden", className)}>{children}</div>;
}

export function DocsCodeBlock(props: Omit<CodeBlockProps, "Actions">): ReactNode {
  return <CodeBlock {...props} Actions={CodeBlockActions} />;
}
