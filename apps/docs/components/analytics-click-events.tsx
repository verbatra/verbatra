"use client";

import { useEffect } from "react";
import { reportClick } from "@/lib/analytics-click-events";

function onClick(event: MouseEvent): void {
  if (event.target instanceof Element) reportClick(event.target);
}

export function AnalyticsClickEvents(): null {
  useEffect(() => {
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);
  return null;
}
