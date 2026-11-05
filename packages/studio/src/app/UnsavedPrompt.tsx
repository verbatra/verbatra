import { Button } from "@verbatra/ui";
import type { ReactNode, RefObject } from "react";
import { useEffect, useRef } from "react";
import type { StructuredError } from "../client/state.js";
import { ErrorMessage } from "./ErrorMessage.js";

export interface UnsavedPromptProps {
  readonly locale: string;
  readonly saving: boolean;
  readonly error: StructuredError | null;
  readonly onSave: () => void;
  readonly onDiscard: () => void;
  readonly onKeepEditing: () => void;
}

export function UnsavedPrompt({
  locale,
  saving,
  error,
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
      data-sticky=""
      className="sticky top-0 z-10 m-0 mb-6 min-w-0 rounded-(--radius-lg) border border-(--status-warning) bg-(--surface-tile) p-3"
    >
      <legend className="sr-only">Unsaved changes</legend>
      <p className="m-0 mb-3 text-sm text-foreground">
        The <span className="font-mono">{locale}</span> translation has changes that are not saved.
      </p>
      {error !== null ? <ErrorMessage error={error} /> : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" size="sm" disabled={saving} onClick={onSave}>
          Save
        </Button>
        <Button size="sm" disabled={saving} onClick={onDiscard}>
          Discard
        </Button>
        <Button ref={keepRef} size="sm" variant="ghost" disabled={saving} onClick={onKeepEditing}>
          Keep editing
        </Button>
      </div>
    </fieldset>
  );
}
