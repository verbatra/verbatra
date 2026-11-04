import type { ReactNode } from "react";

export function ScrollHint(): ReactNode {
  return (
    <p aria-hidden="true" className="mt-2 text-xs text-muted-foreground md:hidden">
      Scroll sideways to see every column.
    </p>
  );
}
