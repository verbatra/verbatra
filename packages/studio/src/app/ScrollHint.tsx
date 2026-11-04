import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

export function ScrollHint(): ReactNode {
  const hintRef = useRef<HTMLParagraphElement>(null);
  const [overflows, setOverflows] = useState(false);

  useEffect(() => {
    const target = hintRef.current?.previousElementSibling;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const measure = (): void => setOverflows(target.scrollWidth > target.clientWidth);
    measure();
    if (typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(measure);
    observer.observe(target);
    for (const child of target.children) {
      observer.observe(child);
    }
    return () => observer.disconnect();
  }, []);

  return (
    <p
      ref={hintRef}
      hidden={!overflows}
      aria-hidden="true"
      className="mt-2 text-xs text-muted-foreground"
    >
      Scroll sideways to see every column.
    </p>
  );
}
