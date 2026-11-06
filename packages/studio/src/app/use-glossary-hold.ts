import { useEffect, useRef, useState } from "react";
import { useDialogDraftGuard } from "./use-dialog-draft-guard.js";

export type PendingHold =
  | { readonly kind: "scope"; readonly next: string }
  | { readonly kind: "close"; readonly source: string };

export interface GlossaryHold {
  readonly visible: boolean;
  readonly pending: PendingHold | undefined;
  readonly saving: boolean;
  requestScope(next: string): void;
  requestClose(source: string): void;
  discard(): void;
  keepEditing(): void;
}

export function useGlossaryHold({
  dirtyAll,
  dirtyScoped,
  saving,
  isSourceDirty,
  discardAll,
  discardSource,
  applyScope,
  focusDirty,
  currentScope,
}: {
  readonly dirtyAll: boolean;
  readonly dirtyScoped: boolean;
  readonly saving: boolean;
  readonly isSourceDirty: (source: string) => boolean;
  readonly discardAll: () => void;
  readonly discardSource: (source: string) => void;
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
    saving,
    onClose: discardAll,
    fieldRef,
    proceedOnSettled: true,
  });
  const [pending, setPending] = useState<PendingHold | undefined>(undefined);
  const sawSaving = useRef(false);

  const pendingDirty =
    pending === undefined
      ? false
      : pending.kind === "scope"
        ? dirtyScoped
        : isSourceDirty(pending.source);

  useEffect(() => {
    if (pending === undefined) {
      sawSaving.current = false;
    } else if (saving) {
      sawSaving.current = true;
    }
  }, [pending, saving]);

  useEffect(() => {
    if (pending === undefined) {
      return;
    }
    if (guard.confirming) {
      setPending(undefined);
    } else if (!pendingDirty && !saving) {
      setPending(undefined);
      if (pending.kind === "scope" && sawSaving.current) {
        applyScope(pending.next);
      }
    }
  }, [pending, pendingDirty, saving, guard.confirming, applyScope]);

  function request(next: PendingHold): void {
    if (guard.confirming) {
      guard.keepEditing();
    }
    setPending(next);
  }

  function requestScope(next: string): void {
    if (next === currentScope) {
      return;
    }
    if (!dirtyScoped) {
      applyScope(next);
      return;
    }
    request({ kind: "scope", next });
  }

  function requestClose(source: string): void {
    if (isSourceDirty(source)) {
      request({ kind: "close", source });
    } else {
      discardSource(source);
    }
  }

  function discard(): void {
    if (pending === undefined) {
      guard.discard();
      return;
    }
    setPending(undefined);
    if (pending.kind === "scope") {
      applyScope(pending.next);
    } else {
      discardSource(pending.source);
    }
  }

  function keepEditing(): void {
    if (pending === undefined) {
      guard.keepEditing();
      return;
    }
    setPending(undefined);
    focusDirty();
  }

  return {
    visible: guard.confirming || pending !== undefined,
    pending,
    saving,
    requestScope,
    requestClose,
    discard,
    keepEditing,
  };
}
