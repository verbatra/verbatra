"use client";

import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { useLinkPrefetch } from "@/lib/use-painted";

type PrefetchAfterPaintLinkProps = ComponentProps<typeof Link>;

export function PrefetchAfterPaintLink({
  prefetch,
  ...rest
}: PrefetchAfterPaintLinkProps): ReactNode {
  return <Link {...rest} prefetch={useLinkPrefetch(prefetch)} />;
}
