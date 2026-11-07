import { Button } from "@verbatra/ui";
import type { KeyboardEvent, ReactNode, RefObject } from "react";
import { useEffect, useRef } from "react";
import type { StructuredError } from "../client/state.js";
import { ErrorMessage } from "./ErrorMessage.js";
import { cn } from "./lib/cn.js";

export interface UnsavedPromptProps {
  readonly subject: ReactNode;
  readonly saving: boolean;
  readonly error: StructuredError | null;
  readonly placement: "pane" | "drawer";
  readonly onSave?: () => void;
  readonly onDiscard: () => void;
  readonly onKeepEditing: () => void;
  readonly saveLabel?: string;
  readonly discardLabel?: string;
  readonly escapeKeepsEditing?: boolean;
}

const BUSY = "aria-disabled:cursor-default aria-disabled:opacity-60 max-md:min-h-11";

export function UnsavedPrompt({
  subject,
  saving,
  error,
  placement,
  onSave,
  onDiscard,
  onKeepEditing,
  saveLabel = "Save",
  discardLabel = "Discard",
  escapeKeepsEditing = false,
}: UnsavedPromptProps): ReactNode {
  const keepRef: RefObject<HTMLButtonElement | null> = useRef(null);
  const rootRef: RefObject<HTMLFieldSetElement | null> = useRef(null);

  useEffect(() => {
    const stuck = rootRef.current?.closest("[data-sticky]") != null;
    if (!stuck) {
      rootRef.current?.scrollIntoView?.({ block: "nearest" });
    }
    keepRef.current?.focus({ preventScroll: stuck });
  }, []);

  function onKeyDown(event: KeyboardEvent<HTMLFieldSetElement>): void {
    if (escapeKeepsEditing && event.key === "Escape" && !event.nativeEvent.isComposing) {
      event.stopPropagation();
      event.preventDefault();
      if (!saving) {
        onKeepEditing();
      }
    }
  }

  return (
    <fieldset
      ref={rootRef}
      onKeyDown={onKeyDown}
      data-unsaved-prompt=""
      className={cn(
        "m-0 min-w-0 rounded-lg border border-warning bg-card p-3",
        placement === "drawer" && "mt-3",
      )}
    >
      <legend className="sr-only">Unsaved changes</legend>
      <p className="m-0 mb-3 text-sm text-foreground">{subject}</p>
      {error !== null ? <ErrorMessage error={error} /> : null}
      <div className="flex flex-wrap items-center gap-2">
        {onSave !== undefined ? (
          <Button
            variant="primary"
            size="sm"
            aria-disabled={saving || undefined}
            className={BUSY}
            onClick={saving ? undefined : onSave}
          >
            {saveLabel}
          </Button>
        ) : null}
        <Button
          size="sm"
          aria-disabled={saving || undefined}
          className={BUSY}
          onClick={saving ? undefined : onDiscard}
        >
          {discardLabel}
        </Button>
        <Button
          ref={keepRef}
          size="sm"
          variant={onSave === undefined ? "primary" : "ghost"}
          aria-disabled={saving || undefined}
          className={BUSY}
          onClick={saving ? undefined : onKeepEditing}
        >
          Keep editing
        </Button>
      </div>
    </fieldset>
  );
}
