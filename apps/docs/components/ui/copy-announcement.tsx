import type { ReactNode } from "react";
import type { CopyStatus } from "@/lib/use-copy-to-clipboard";

export function CopyAnnouncement({
  status,
  attempts,
  copied,
  failed,
}: {
  status: CopyStatus;
  attempts: number;
  copied: string;
  failed: string;
}): ReactNode {
  return (
    <span aria-live="polite" className="sr-only">
      {status === "idle" ? null : (
        <span key={attempts}>{status === "copied" ? copied : failed}</span>
      )}
    </span>
  );
}
