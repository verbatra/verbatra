import type { ReactNode, Ref } from "react";
import { Button } from "./button.tsx";
import { cn } from "./cn.ts";
import { Icon } from "./icon.tsx";
import { microLabelClassName } from "./section.tsx";

export function OverlayBackdrop({ onClose }: { readonly onClose: () => void }): ReactNode {
  return (
    <div
      aria-hidden="true"
      data-backdrop=""
      className="absolute inset-0 z-0 cursor-default bg-(--scrim)"
      onClick={onClose}
    />
  );
}

export function DialogCloseButton({
  onClose,
  label = "Close",
  className,
}: {
  readonly onClose: () => void;
  readonly label?: string;
  readonly className?: string;
}): ReactNode {
  return (
    <Button
      variant="ghost"
      className={className ?? "flex-none p-1.5"}
      onClick={onClose}
      aria-label={label}
    >
      <Icon name="close" />
    </Button>
  );
}

export type SheetSide = "start" | "end" | "top" | "bottom";

export type SheetSize = "default" | "wide";

const CONTAINER: Readonly<Record<SheetSide, string>> = {
  start: "justify-start",
  end: "justify-end",
  top: "items-start",
  bottom: "items-end",
};

const WIDE_PANEL = "w-[min(960px,100%)]";

const PANEL: Readonly<Record<SheetSide, string>> = {
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
    <div className={cn("fixed inset-0 z-20 flex", CONTAINER[side])} data-side={side}>
      <OverlayBackdrop onClose={onClose} />
      <div
        className={cn(
          "relative z-10 overflow-y-auto border-(--border-default) bg-(--surface-tile) shadow-(--shadow-panel)",
          PANEL[side],
          size === "wide" && WIDE_PANEL,
        )}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        data-size={size}
        ref={containerRef}
      >
        <div className="sticky top-0 z-10 border-b border-(--border-default) bg-(--surface-tile) px-6 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              {kicker !== undefined ? (
                <p className={cn("mb-1", microLabelClassName)}>{kicker}</p>
              ) : null}
              <h2 className="m-0 break-words font-mono text-base font-semibold text-(--text-strong)">
                {title}
              </h2>
            </div>
            <DialogCloseButton onClose={onClose} label={closeLabel} />
          </div>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

export function DrawerShell(props: Omit<SheetProps, "side">): ReactNode {
  return <Sheet side="end" {...props} />;
}
