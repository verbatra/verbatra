import type { ReactNode } from "react";
import { VMark } from "@/components/landing";

export function SiteWordmark(): ReactNode {
  return (
    <span className="inline-flex items-center gap-2">
      <VMark size={20} decorative />
      <span
        className="text-lg font-semibold tracking-tight"
        style={{ fontFamily: "var(--font-display)" }}
      >
        verbatra
      </span>
    </span>
  );
}
