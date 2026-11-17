"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { reportClick } from "@/lib/analytics-click-events";
import { reportPageview } from "@/lib/analytics-report";

function onClick(event: MouseEvent): void {
  if (event.target instanceof Element) reportClick(event.target);
}

export function AnalyticsReporter(): null {
  const pathname = usePathname();
  const reported = useRef(pathname);

  useEffect(() => {
    if (reported.current === pathname) return;
    reported.current = pathname;
    reportPageview(pathname);
  }, [pathname]);

  useEffect(() => {
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  return null;
}
