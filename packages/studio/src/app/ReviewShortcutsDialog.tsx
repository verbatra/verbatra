import type { ReactNode } from "react";
import { keyCap, visibleShortcuts } from "../client/review-shortcuts.js";
import { DrawerShell } from "./ui.js";
import { useDialogA11y } from "./use-dialog-a11y.js";

function KeyCapView({ keyName }: { readonly keyName: string }): ReactNode {
  const cap = keyCap(keyName);
  return (
    <kbd className="inline-flex min-w-6 items-center justify-center rounded-sm border border-border bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
      <span aria-hidden="true">{cap.glyph}</span>
      <span className="sr-only">{cap.name}</span>
    </kbd>
  );
}

export function ReviewShortcutsDialog({
  spend,
  onClose,
}: {
  readonly spend: boolean;
  readonly onClose: () => void;
}): ReactNode {
  const containerRef = useDialogA11y<HTMLDivElement>({ isOpen: true, onClose });
  return (
    <DrawerShell
      title="Keyboard shortcuts"
      ariaLabel="Keyboard shortcuts for the review queue"
      closeLabel="Close the keyboard shortcuts"
      onClose={onClose}
      containerRef={containerRef}
    >
      <p className="mb-4 text-sm text-muted-foreground">
        Shortcuts act on the highlighted entry. They pause while you type in a field or a dialog is
        open.
      </p>
      <dl className="m-0 grid grid-cols-[max-content_1fr] items-center gap-x-6 gap-y-3">
        {visibleShortcuts(spend).map((shortcut) => (
          <div key={shortcut.action} className="contents" data-shortcut={shortcut.action}>
            <dt className="flex items-center gap-1.5">
              {shortcut.keys.map((key, index) => (
                <span key={key} className="inline-flex items-center gap-1.5">
                  {index > 0 ? <span className="text-xs text-muted-foreground">or</span> : null}
                  <KeyCapView keyName={key} />
                </span>
              ))}
            </dt>
            <dd className="m-0 text-sm text-foreground">{shortcut.label}</dd>
          </div>
        ))}
        <div className="contents">
          <dt>
            <KeyCapView keyName="Esc" />
          </dt>
          <dd className="m-0 text-sm text-foreground">Close a dialog</dd>
        </div>
      </dl>
    </DrawerShell>
  );
}
