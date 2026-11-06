import { useEffect, useRef, useState } from "react";
import { useDialogDraftGuard } from "./use-dialog-draft-guard.js";

export interface GlossaryHold {
  readonly visible: boolean;
  readonly pendingScope: string | undefined;
  requestScope(next: string): void;
  discard(): void;
  keepEditing(): void;
}

export function useGlossaryHold({
  dirtyAll,
  dirtyScoped,
  discardAll,
  applyScope,
  focusDirty,
  currentScope,
}: {
  readonly dirtyAll: boolean;
  readonly dirtyScoped: boolean;
  readonly discardAll: () => void;
  readonly applyScope: (next: string) => void;
  readonly focusDirty: () => void;
  readonly currentScope: string;
}): GlossaryHold {
  const focusLatest = useRef(focusDirty);
  useEffect(() => {
    focusLatest.current = focusDirty;
  });
  const fieldRef = useRef<{ focus(): void } | null>({ focus: () => focusLatest.current() });
  const guard = useDialogDraftGuard({
    dirty: dirtyAll,
    saving: false,
    onClose: discardAll,
    fieldRef,
  });
  const [pendingScope, setPendingScope] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (pendingScope !== undefined && (!dirtyScoped || guard.confirming)) {
      setPendingScope(undefined);
    }
  }, [pendingScope, dirtyScoped, guard.confirming]);

  function requestScope(next: string): void {
    if (next === currentScope) {
      return;
    }
    if (!dirtyScoped) {
      applyScope(next);
      return;
    }
    if (guard.confirming) {
      guard.keepEditing();
    }
    setPendingScope(next);
  }

  function discard(): void {
    if (pendingScope === undefined) {
      guard.discard();
      return;
    }
    const next = pendingScope;
    setPendingScope(undefined);
    applyScope(next);
  }

  function keepEditing(): void {
    if (pendingScope === undefined) {
      guard.keepEditing();
      return;
    }
    setPendingScope(undefined);
    focusDirty();
  }

  return {
    visible: guard.confirming || pendingScope !== undefined,
    pendingScope,
    requestScope,
    discard,
    keepEditing,
  };
}
