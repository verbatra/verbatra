import { Button, Icon } from "@verbatra/ui";
import type { ReactNode } from "react";
import { openValueReplace } from "./value-replace-session.js";

export function ValueReplaceButton({
  locales,
  draftKey,
  holdForDraft,
}: {
  readonly locales: readonly string[];
  readonly draftKey: string | null;
  readonly holdForDraft: (onProceed: () => void) => boolean;
}): ReactNode {
  function request(opener: HTMLElement): void {
    const openDialog = (): void => openValueReplace(locales, opener);
    if (draftKey === null || !holdForDraft(openDialog)) {
      openDialog();
    }
  }

  return (
    <Button onClick={(event) => request(event.currentTarget)} data-value-replace-open="">
      <Icon name="search" size={14} />
      Search and replace
    </Button>
  );
}
