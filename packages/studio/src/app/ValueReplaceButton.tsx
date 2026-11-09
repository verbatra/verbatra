import { Button, Icon } from "@verbatra/ui";
import type { ReactNode } from "react";
import { useState } from "react";
import { ValueReplaceDialog } from "./ValueReplaceDialog.js";

export function ValueReplaceButton({
  locales,
  draftKey,
}: {
  readonly locales: readonly string[];
  readonly draftKey: string | null;
}): ReactNode {
  const [open, setOpen] = useState(false);
  const held = draftKey !== null;
  return (
    <>
      <Button
        aria-disabled={held || undefined}
        aria-describedby={held ? "value-replace-hold" : undefined}
        onClick={held ? undefined : () => setOpen(true)}
        data-value-replace-open=""
      >
        <Icon name="search" size={14} />
        Search and replace
      </Button>
      {held ? (
        <span
          id="value-replace-hold"
          role="status"
          className="min-w-0 text-xs text-muted-foreground wrap-anywhere"
          data-value-replace-hold=""
        >
          Save or discard your unsaved edit of{" "}
          <span dir="ltr" className="font-mono">
            {draftKey}
          </span>{" "}
          first. Replacing writes translation files.
        </span>
      ) : null}
      {open && !held ? (
        <ValueReplaceDialog locales={locales} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}
