import type { ReactNode } from "react";
import { useEffect, useRef } from "react";

export function ReplaceLead({ children }: { readonly children: ReactNode }): ReactNode {
  const ref = useRef<HTMLParagraphElement | null>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <p
      ref={ref}
      tabIndex={-1}
      role="status"
      data-replace-lead=""
      className="m-0 mb-3 -mx-1.5 rounded-sm px-1.5 py-1 text-sm font-medium text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      {children}
    </p>
  );
}
