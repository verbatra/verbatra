"use client";

import { type ReactNode, useEffect, useRef } from "react";

function revealFocusedLink(event: FocusEvent): void {
  if (!(event.target instanceof HTMLElement)) return;
  event.target.scrollIntoView({ block: "nearest", inline: "nearest" });
}

export function MarqueeRow({
  direction,
  children,
}: {
  direction: "left" | "right";
  children: ReactNode;
}): ReactNode {
  const row = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = row.current;
    element?.addEventListener("focusin", revealFocusedLink);
    return () => element?.removeEventListener("focusin", revealFocusedLink);
  }, []);

  return (
    <div ref={row} className="vk-marquee" data-direction={direction}>
      {children}
    </div>
  );
}
