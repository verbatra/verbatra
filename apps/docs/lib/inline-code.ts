import type { ReactNode } from "react";

export const SHORT_INLINE_CODE_MAX = 32;

export function isShortInlineCode(children: ReactNode): boolean {
  return typeof children === "string" && children.length <= SHORT_INLINE_CODE_MAX;
}
