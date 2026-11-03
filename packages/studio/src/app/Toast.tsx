import { Card } from "@verbatra/ui";
import type { ReactNode } from "react";

export function Toast({ children }: { readonly children: ReactNode }): ReactNode {
  return (
    <Card
      padding="sm"
      role="status"
      className="fixed bottom-6 right-6 z-40 flex w-[min(360px,calc(100vw-3rem))] flex-col gap-2 shadow-panel-lg"
    >
      {children}
    </Card>
  );
}
