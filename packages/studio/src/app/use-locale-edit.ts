import { useEffect, useState } from "react";
import {
  type DraftState,
  draftIdentity,
  EMPTY_DRAFT,
  isDraftDirty,
  reconcileDraft,
} from "../client/draft-state.js";
import { deriveEditEntryOutcome } from "../client/edit-entry-outcome.js";
import { deriveKeyValueContext, type KeyValueContext } from "../client/key-value-context.js";
import { rpcClient } from "./api.js";
import type { SubmitState } from "./entry-editor-parts.js";

const LOADING: KeyValueContext = { kind: "loading" };

const UNHELD: HeldContext = { identity: null, context: LOADING };

interface HeldContext {
  readonly identity: string | null;
  readonly context: KeyValueContext;
}

interface HeldSubmit {
  readonly identity: string | null;
  readonly state: SubmitState;
}

const IDLE: SubmitState = { kind: "idle" };

export interface LocaleEdit {
  readonly context: KeyValueContext;
  readonly draft: string;
  readonly dirty: boolean;
  readonly submit: SubmitState;
  setDraft(next: string): void;
  save(target: string): Promise<boolean>;
}

function useHeldContext(
  identity: string | null,
  locale: string | null,
  keyName: string,
  refreshToken: number,
): KeyValueContext {
  const [held, setHeld] = useState<HeldContext>(UNHELD);

  useEffect(() => {
    if (locale === null) {
      setHeld(UNHELD);
      return;
    }
    let cancelled = false;
    void rpcClient.call("key.context", { locale, key: keyName }).then((response) => {
      if (!cancelled) {
        setHeld({ identity, context: deriveKeyValueContext(response) });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [identity, locale, keyName, refreshToken]);

  return held.identity === identity ? held.context : LOADING;
}

export function useLocaleEdit(
  locale: string | null,
  keyName: string,
  refreshToken: number,
): LocaleEdit {
  const identity = draftIdentity(locale, keyName);
  const context = useHeldContext(identity, locale, keyName, refreshToken);
  const [draftState, setDraftState] = useState<DraftState>(EMPTY_DRAFT);
  const [heldSubmit, setHeldSubmit] = useState<HeldSubmit>({ identity: null, state: IDLE });

  const baseline = context.kind === "loaded" ? (context.target ?? "") : null;
  const current = reconcileDraft(draftState, identity, baseline);
  if (current !== draftState) {
    setDraftState(current);
  }
  const submit = heldSubmit.identity === identity ? heldSubmit.state : IDLE;

  async function save(target: string): Promise<boolean> {
    setHeldSubmit({ identity, state: { kind: "submitting" } });
    const response = await rpcClient.call("translation.editEntry", {
      locale: target,
      key: keyName,
      value: current.text,
    });
    const outcome = deriveEditEntryOutcome(response);
    setHeldSubmit({ identity, state: { kind: "settled", outcome } });
    return outcome.kind === "success";
  }

  return {
    context,
    draft: current.identity === identity ? current.text : "",
    dirty: context.kind === "loaded" && isDraftDirty(current),
    submit,
    setDraft: (next) => setDraftState({ ...current, text: next }),
    save,
  };
}
