"use client";

import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { useIntentPrefetch } from "@/lib/use-intent-prefetch";

type IntentPrefetchLinkProps = ComponentProps<typeof Link>;

export function IntentPrefetchLink({
  prefetch,
  onMouseEnter,
  onFocus,
  onTouchStart,
  ...rest
}: IntentPrefetchLinkProps): ReactNode {
  return (
    <Link {...rest} {...useIntentPrefetch(prefetch, { onMouseEnter, onFocus, onTouchStart })} />
  );
}
