import type { Root } from "fumadocs-core/page-tree";
import type { ReactNode } from "react";
import { eyebrowTrail, pagePath } from "@/lib/docs-breadcrumb";

export function PageEyebrow({ tree, url }: { tree: Root; url: string }): ReactNode {
  const trail = eyebrowTrail(tree, pagePath(tree, url));
  if (trail.length === 0) return null;
  return <p className="vk-page-eyebrow vk-label">{trail.join(" / ")}</p>;
}
