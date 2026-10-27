import type { GlossaryDraftCheck } from "@verbatra/sdk";
import { useEffect, useState } from "react";
import { draftCheckFor } from "../client/key-value-context.js";
import { rpcClient } from "./api.js";

export const DRAFT_CHECK_DELAY_MS = 250;

export function useDraftCheck(
  locale: string,
  keyName: string,
  draft: string,
  enabled: boolean,
): GlossaryDraftCheck | undefined {
  const [check, setCheck] = useState<GlossaryDraftCheck | undefined>(undefined);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void rpcClient.call("key.context", { locale, key: keyName, draft }).then((response) => {
        if (!cancelled) {
          setCheck(draftCheckFor(response));
        }
      });
    }, DRAFT_CHECK_DELAY_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [locale, keyName, draft, enabled]);

  return enabled ? check : undefined;
}
