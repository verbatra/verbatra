import type { ReactNode } from "react";

export function withInlineCode(text: string): ReactNode {
  if (!text.includes("`")) return text;
  return text.split(/`([^`]+)`/).map((part, index) =>
    index % 2 === 1 ? (
      <code
        key={`${index}-${part}`}
        className="vk-code-short font-mono text-[0.9em] text-[color:var(--text-strong)]"
      >
        {part}
      </code>
    ) : (
      part
    ),
  );
}
