import type { ReactNode } from "react";
import { NewPill } from "@/components/new-pill";

export function NewBadge({ children }: { children: ReactNode }): ReactNode {
  return <NewPill className="ms-1.5">{children}</NewPill>;
}
