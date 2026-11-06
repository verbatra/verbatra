import { type RefObject, useEffect, useRef, useState } from "react";
import { installRouteGuard, restoreHeldRoute, setUnloadWarning } from "./route-guard.js";

export interface DialogDraftGuard {
  readonly confirming: boolean;
  requestClose(): void;
  keepEditing(): void;
  discard(): void;
  takeHeldRoute(): (() => Promise<void>) | null;
}

export function useDialogDraftGuard({
  dirty,
  saving,
  onClose,
  fieldRef,
  proceedOnSettled = false,
}: {
  readonly dirty: boolean;
  readonly saving: boolean;
  readonly onClose: () => void;
  readonly fieldRef: RefObject<{ focus(): void } | null>;
  readonly proceedOnSettled?: boolean;
}): DialogDraftGuard {
  const [confirming, setConfirming] = useState(false);
  const heldRoute = useRef<(() => Promise<void>) | null>(null);
  const dirtyRef = useRef(false);

  useEffect(() => {
    dirtyRef.current = dirty;
    setUnloadWarning(dirty);
  }, [dirty]);

  useEffect(
    () =>
      installRouteGuard({
        isDirty: () => dirtyRef.current,
        onBlock: (proceed) => {
          heldRoute.current = proceed;
          setConfirming(true);
        },
        onRelease: () => {
          heldRoute.current = null;
          setConfirming(false);
          fieldRef.current?.focus();
        },
      }),
    [fieldRef],
  );

  const sawSaving = useRef(false);
  useEffect(() => {
    if (!confirming) {
      sawSaving.current = false;
    } else if (saving) {
      sawSaving.current = true;
    }
  }, [confirming, saving]);

  useEffect(() => {
    if (confirming && !dirty && !saving) {
      if (heldRoute.current !== null) {
        if (proceedOnSettled && sawSaving.current) {
          const held = takeHeldRoute();
          void held?.();
        } else {
          restoreHeldRoute();
        }
        heldRoute.current = null;
      }
      setConfirming(false);
    }
  }, [confirming, dirty, saving, proceedOnSettled]);

  function takeHeldRoute(): (() => Promise<void>) | null {
    const held = heldRoute.current;
    heldRoute.current = null;
    dirtyRef.current = false;
    return held;
  }

  function keepEditing(): void {
    restoreHeldRoute();
    heldRoute.current = null;
    setConfirming(false);
    fieldRef.current?.focus();
  }

  return {
    confirming,
    requestClose: () => {
      if (saving) {
        return;
      }
      if (confirming) {
        keepEditing();
      } else if (dirty) {
        setConfirming(true);
      } else {
        onClose();
      }
    },
    keepEditing,
    discard: () => {
      const held = takeHeldRoute();
      onClose();
      void held?.();
    },
    takeHeldRoute,
  };
}
