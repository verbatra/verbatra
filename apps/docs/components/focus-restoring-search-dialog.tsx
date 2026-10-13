"use client";

import type { DefaultSearchDialogProps } from "fumadocs-ui/components/dialog/search-default";
import { lazy, type ReactNode, useEffect, useLayoutEffect, useRef } from "react";

const DefaultSearchDialog = lazy(() => import("fumadocs-ui/components/dialog/search-default"));

function focusedElement(): HTMLElement | null {
  const active = document.activeElement;
  return active instanceof HTMLElement && active !== document.body ? active : null;
}

export function FocusRestoringSearchDialog(props: DefaultSearchDialogProps): ReactNode {
  const opener = useRef<HTMLElement | null>(null);
  const { open } = props;

  useLayoutEffect(() => {
    if (open) opener.current = focusedElement();
  }, [open]);

  useEffect(() => {
    if (open) return;
    const target = opener.current;
    opener.current = null;
    if (target?.isConnected) target.focus();
  }, [open]);

  return <DefaultSearchDialog {...props} />;
}
