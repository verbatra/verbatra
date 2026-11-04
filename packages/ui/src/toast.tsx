import type { ReactNode } from "react";
import { Card } from "./card.tsx";

export function Toast({ children }: { readonly children: ReactNode }): ReactNode {
  return (
    <Card
      padding="sm"
      role="status"
      className="fixed right-6 bottom-6 z-40 flex w-[min(360px,calc(100vw-3rem))] flex-col gap-2 shadow-(--shadow-panel)"
    >
      {children}
    </Card>
  );
}
