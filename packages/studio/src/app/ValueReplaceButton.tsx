import { Button, Icon } from "@verbatra/ui";
import type { ReactNode } from "react";
import { useState } from "react";
import { ValueReplaceDialog } from "./ValueReplaceDialog.js";

export function ValueReplaceButton({
  locales,
  draftKey,
  holdForDraft,
}: {
  readonly locales: readonly string[];
  readonly draftKey: string | null;
  readonly holdForDraft: (onProceed: () => void) => boolean;
}): ReactNode {
  const [open, setOpen] = useState(false);

  function request(): void {
    const openDialog = (): void => setOpen(true);
    if (draftKey === null || !holdForDraft(openDialog)) {
      openDialog();
    }
  }

  return (
    <>
      <Button onClick={request} data-value-replace-open="">
        <Icon name="search" size={14} />
        Search and replace
      </Button>
      {open ? <ValueReplaceDialog locales={locales} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
