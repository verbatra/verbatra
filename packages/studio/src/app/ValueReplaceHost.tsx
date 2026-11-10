import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { useDiffState } from "./use-diff-state.js";
import { ValueReplaceDialog } from "./ValueReplaceDialog.js";
import { closeValueReplace, useValueReplaceSession } from "./value-replace-session.js";

function OpenDialog({
  fallbackLocales,
  refreshToken,
}: {
  readonly fallbackLocales: readonly string[];
  readonly refreshToken: number;
}): ReactNode {
  const diff = useDiffState(refreshToken);
  const locales =
    diff.kind === "loaded" ? diff.locales.map((entry) => entry.locale) : fallbackLocales;
  return <ValueReplaceDialog locales={locales} onClose={closeValueReplace} />;
}

function useRestoreFocusOnClose(opener: HTMLElement | null | undefined): void {
  const openerRef = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);
  useEffect(() => {
    if (opener !== undefined) {
      wasOpen.current = true;
      openerRef.current = opener;
      return;
    }
    if (!wasOpen.current) {
      return;
    }
    wasOpen.current = false;
    const target = openerRef.current;
    openerRef.current = null;
    if (target?.isConnected === true) {
      target.focus();
    } else {
      document.getElementById("main")?.focus();
    }
  }, [opener]);
}

export function ValueReplaceHost({ refreshToken }: { readonly refreshToken: number }): ReactNode {
  const session = useValueReplaceSession();
  useRestoreFocusOnClose(session === null ? undefined : session.opener);
  return session === null ? null : (
    <OpenDialog fallbackLocales={session.locales} refreshToken={refreshToken} />
  );
}
