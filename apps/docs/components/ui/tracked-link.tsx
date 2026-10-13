"use client";

import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { useLinkPrefetch } from "@/lib/use-painted";

export type TrackedLinkProps = ComponentProps<typeof Link>;

export function TrackedLink({ prefetch, ...rest }: TrackedLinkProps): ReactNode {
  return <Link {...rest} prefetch={useLinkPrefetch(prefetch)} />;
}
