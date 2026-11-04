import { Button } from "@verbatra/ui";
import type { ReactNode, RefObject } from "react";
import { useEffect, useRef } from "react";

export interface UnsavedPromptProps {
  readonly locale: string;
  readonly saving: boolean;
  readonly onSave: () => void;
  readonly onDiscard: () => void;
  readonly onKeepEditing: () => void;
}

export function UnsavedPrompt({
  locale,
  saving,
  onSave,
  onDiscard,
  onKeepEditing,
}: UnsavedPromptProps): ReactNode {
  const keepRef: RefObject<HTMLButtonElement | null> = useRef(null);

  useEffect(() => {
    keepRef.current?.focus();
  }, []);

  return (
    <fieldset
      data-unsaved-prompt=""
      className="m-0 mb-6 min-w-0 rounded-(--radius-lg) border border-(--status-warning) bg-(--status-warning-soft) p-3"
    >
      <legend className="sr-only">Unsaved changes</legend>
      <p className="m-0 mb-3 text-sm text-foreground">
        The <span className="font-mono">{locale}</span> translation has changes that are not saved.
      </p>
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
