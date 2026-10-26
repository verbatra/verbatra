"use client";

import { useTreeContext, useTreePath } from "fumadocs-ui/contexts/tree";
import { ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { Fragment, type ReactNode } from "react";
import { visibleTrail } from "@/lib/docs-breadcrumb";

export function DocsCrumbBar({ children }: { children: ReactNode }): ReactNode {
  const t = useTranslations("docs.breadcrumb");
  const { full } = useTreeContext();
  const trail = visibleTrail(full, useTreePath());
  const last = trail.length - 1;
  return (
    <div className="vk-crumb-bar">
      {children}
      <nav aria-label={t("label")} className="vk-crumbs">
        <ol>
          {trail.map((crumb, index) => (
            <Fragment key={`${crumb.url ?? "crumb"}:${trail.length - index}`}>
              {index > 0 ? (
                <li aria-hidden="true" className="vk-crumbs-separator">
                  <ChevronRight />
                </li>
              ) : null}
              <li
                className="vk-crumbs-item"
                {...(index === last ? { "aria-current": "page" as const } : {})}
              >
                {crumb.name}
              </li>
            </Fragment>
          ))}
        </ol>
      </nav>
    </div>
  );
}
