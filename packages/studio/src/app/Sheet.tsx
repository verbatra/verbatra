import type { ReactNode, Ref } from "react";
import { cn } from "./lib/cn.js";
import { DialogCloseButton, microLabelClassName, OverlayBackdrop } from "./ui.js";

export type SheetSide = "start" | "end" | "top" | "bottom";

export type SheetSize = "default" | "wide";

const CONTAINER_CLASSNAME: Readonly<Record<SheetSide, string>> = {
  start: "justify-start",
  end: "justify-end",
  top: "items-start",
  bottom: "items-end",
};

const WIDE_PANEL_CLASSNAME = "w-[min(960px,100%)]";

const PANEL_CLASSNAME: Readonly<Record<SheetSide, string>> = {
  start: "h-full w-[min(480px,100%)] border-e",
  end: "h-full w-[min(480px,100%)] border-s",
  top: "w-full max-h-[80vh] border-b",
  bottom: "w-full max-h-[80vh] border-t",
};

export interface SheetProps {
  readonly side?: SheetSide;
  readonly size?: SheetSize;
  readonly kicker?: string;
  readonly title: ReactNode;
  readonly ariaLabel: string;
  readonly closeLabel: string;
  readonly onClose: () => void;
  readonly containerRef: Ref<HTMLDivElement>;
  readonly children: ReactNode;
}

export function Sheet({
  side = "end",
  size = "default",
  kicker,
  title,
  ariaLabel,
  closeLabel,
  onClose,
  containerRef,
  children,
}: SheetProps): ReactNode {
  return (
    <div className={cn("fixed inset-0 z-20 flex", CONTAINER_CLASSNAME[side])}>
      <OverlayBackdrop onClose={onClose} label={closeLabel} />
      <div
        className={cn(
          "relative z-10 overflow-y-auto border-border bg-card shadow-panel-lg",
          PANEL_CLASSNAME[side],
          size === "wide" && WIDE_PANEL_CLASSNAME,
        )}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        ref={containerRef}
      >
        <div className="sticky top-0 z-10 border-b border-border bg-card px-6 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              {kicker !== undefined ? (
                <p className={cn("mb-1", microLabelClassName)}>{kicker}</p>
              ) : null}
              <h2 className="m-0 break-words font-mono text-base font-semibold text-foreground">
                {title}
              </h2>
            </div>
            <DialogCloseButton onClose={onClose} />
          </div>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}
