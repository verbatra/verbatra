import type { CSSProperties } from "react";

export function reservedWidth(initial: string | null): CSSProperties | undefined {
  return initial === null ? undefined : { minInlineSize: `${initial.length}ch` };
}
