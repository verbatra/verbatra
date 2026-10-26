"use client";

import { useTreeContext, useTreePath } from "fumadocs-ui/contexts/tree";
import { ChevronRight } from "lucide-react";
import { Fragment, type ReactNode } from "react";
import { crumbTrail } from "@/lib/docs-crumbs";

export function DocsCrumbBar({ children }: { children: ReactNode }): ReactNode {
  const { root } = useTreeContext();
  const trail = crumbTrail(root, useTreePath());
  return (
    <div className="vk-crumb-bar md:hidden">
      {children}
      <p className="vk-crumbs">
        {trail.map((crumb, index) => (
          <Fragment key={`${index}-${crumb.url ?? ""}`}>
            {index > 0 ? <ChevronRight aria-hidden="true" className="vk-crumbs-separator" /> : null}
            <span
              className="vk-crumbs-item"
              {...(index === trail.length - 1 ? { "aria-current": "page" as const } : {})}
            >
              {crumb.name}
            </span>
          </Fragment>
        ))}
      </p>
    </div>
  );
}
