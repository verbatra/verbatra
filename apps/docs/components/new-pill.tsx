import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

export const NEW_PILL_CLASS = "vk-pill-new";

export function NewPill({ children }: { children: ReactNode }): ReactNode {
  return (
    <span className={NEW_PILL_CLASS}>
      <span aria-hidden="true" className="vk-pill-new-ring" />
      <span aria-hidden="true" className="vk-pill-new-shimmer" />
      {children}
    </span>
  );
}

type NewAnnouncementProps = {
  href: string;
  badge: string;
  newTab: string;
  children: ReactNode;
};

export function NewAnnouncement({
  href,
  badge,
  newTab,
  children,
}: NewAnnouncementProps): ReactNode {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="vk-announce">
      <NewPill>{badge}</NewPill> <span className="vk-announce-text">{children}</span>
      <ChevronRight aria-hidden="true" className="vk-announce-chevron" />
      <span className="sr-only"> {newTab}</span>
    </a>
  );
}
