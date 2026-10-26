"use client";

import { useTreeContext, useTreePath } from "fumadocs-ui/contexts/tree";
import type { ReactNode } from "react";
import { pageGroup } from "@/lib/docs-crumbs";

export function PageEyebrow(): ReactNode {
  const { root } = useTreeContext();
  const group = pageGroup(root, useTreePath());
  if (group === undefined) return null;
  return <p className="vk-page-eyebrow vk-label">{group}</p>;
}
