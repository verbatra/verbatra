import type { ReactNode } from "react";
import { SHORT_CODE_CLASS } from "@/lib/inline-code";
import { cn } from "@/lib/utils";

export function withoutInlineCode(text: string): string {
  return text.replaceAll("`", "");
}

export function withInlineCode(text: string): ReactNode {
  if (!text.includes("`")) return text;
  return text.split(/`([^`]+)`/).map((part, index) =>
    index % 2 === 1 ? (
      <code
        key={`${index}-${part}`}
        className={cn(SHORT_CODE_CLASS, "font-mono text-[0.9em] text-[color:var(--text-strong)]")}
      >
        {part}
      </code>
    ) : (
      part
    ),
  );
}
