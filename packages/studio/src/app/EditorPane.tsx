import { Card, DialogCloseButton, microLabelClassName } from "@verbatra/ui";
import type { KeyboardEvent, ReactNode } from "react";
import { cn } from "./lib/cn.js";

export interface EditorPaneProps {
  readonly keyName: string;
  readonly banner: ReactNode;
  readonly onClose: () => void;
  readonly onEscape: () => void;
  readonly children: ReactNode;
}

export function EditorPane({
  keyName,
  banner,
  onClose,
  onEscape,
  children,
}: EditorPaneProps): ReactNode {
  function handleKeyDown(event: KeyboardEvent<HTMLElement>): void {
    if (event.key === "Escape" && !event.defaultPrevented) {
      event.stopPropagation();
      onEscape();
    }
  }

  return (
    <Card
      as="section"
      padding="none"
      aria-label={`Editor for ${keyName}`}
      data-editor-pane=""
      className="sticky top-[4.5rem] flex max-h-[calc(100dvh-9rem)] flex-col self-start overflow-hidden"
      onKeyDown={handleKeyDown}
    >
      <div className="flex flex-none items-start justify-between gap-3 border-b border-(--border-default) px-4 py-3">
        <div className="min-w-0">
          <p className={cn("mb-1", microLabelClassName)}>Key details</p>
          <h2 className="m-0 break-words font-mono text-base font-semibold text-(--text-strong)">
            {keyName}
          </h2>
        </div>
        <DialogCloseButton onClose={onClose} label={`Close details for ${keyName}`} />
      </div>
      <div
        data-editor-scroller=""
        className="min-h-0 flex-1 scroll-pt-40 overflow-y-auto px-4 pb-4"
      >
        {banner !== null ? (
          <div data-editor-banner="" data-sticky="" className="sticky top-0 z-10 bg-card py-2">
            {banner}
          </div>
        ) : null}
        <div className="pt-4">{children}</div>
      </div>
    </Card>
  );
}
