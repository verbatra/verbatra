import { Button } from "@verbatra/ui";
import type { ReactNode, RefObject } from "react";
import { useEffect, useRef } from "react";
import type { StructuredError } from "../client/state.js";
import { ErrorMessage } from "./ErrorMessage.js";
import { cn } from "./lib/cn.js";

export interface UnsavedPromptProps {
  readonly locale: string;
  readonly saving: boolean;
  readonly error: StructuredError | null;
  readonly placement: "pane" | "drawer";
  readonly onSave: () => void;
  readonly onDiscard: () => void;
  readonly onKeepEditing: () => void;
}

const BUSY = "aria-disabled:cursor-default aria-disabled:opacity-60";

export function UnsavedPrompt({
  locale,
  saving,
  error,
  placement,
  onSave,
  onDiscard,
  onKeepEditing,
}: UnsavedPromptProps): ReactNode {
  const keepRef: RefObject<HTMLButtonElement | null> = useRef(null);
  const rootRef: RefObject<HTMLFieldSetElement | null> = useRef(null);

  useEffect(() => {
    rootRef.current?.scrollIntoView?.({ block: "nearest" });
    keepRef.current?.focus();
  }, []);

  return (
    <fieldset
      ref={rootRef}
      data-unsaved-prompt=""
      className={cn(
        "m-0 min-w-0 rounded-lg border border-warning bg-card p-3",
        placement === "drawer" && "mt-3",
      )}
    >
      <legend className="sr-only">Unsaved changes</legend>
      <p className="m-0 mb-3 text-sm text-foreground">
        The <span className="font-mono">{locale}</span> translation has changes that are not saved.
      </p>
      {error !== null ? <ErrorMessage error={error} /> : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          size="sm"
          aria-disabled={saving || undefined}
          className={BUSY}
          onClick={saving ? undefined : onSave}
        >
          Save
        </Button>
        <Button
          size="sm"
          aria-disabled={saving || undefined}
          className={BUSY}
          onClick={saving ? undefined : onDiscard}
        >
          Discard
        </Button>
        <Button
          ref={keepRef}
          size="sm"
          variant="ghost"
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
