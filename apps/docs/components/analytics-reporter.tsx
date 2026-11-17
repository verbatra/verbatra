"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { reportClick } from "@/lib/analytics-click-events";
import { reportPageview } from "@/lib/analytics-report";

function onClick(event: MouseEvent): void {
  if (event.target instanceof Element) reportClick(event.target);
}

let lastPathname: string | undefined;

export function forgetReportedPath(): void {
  lastPathname = undefined;
}

export function AnalyticsReporter(): null {
  const pathname = usePathname();

  useEffect(() => {
    const previous = lastPathname;
    lastPathname = pathname;
    if (previous === undefined || previous === pathname) return;
    reportPageview(pathname);
  }, [pathname]);

  useEffect(() => {
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  return null;
}
