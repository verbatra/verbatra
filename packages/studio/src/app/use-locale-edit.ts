import { useEffect, useLayoutEffect, useRef, useState } from "react";
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

const NO_SUBMIT: HeldSubmit = { identity: null, state: IDLE };

export interface LocaleEdit {
  readonly context: KeyValueContext;
  readonly draft: string;
  readonly dirty: boolean;
  readonly submit: SubmitState;
  setDraft(next: string): void;
  readonly retrying: boolean;
  retry(): void;
  reload(): void;
  save(target: string): Promise<boolean>;
}

function useHeldContext(
  identity: string | null,
  locale: string | null,
  keyName: string,
  refreshToken: number,
): {
  readonly context: KeyValueContext;
  readonly retrying: boolean;
  retry(): void;
  reload(): void;
} {
  const [held, setHeld] = useState<HeldContext>(UNHELD);
  const [attempt, setAttempt] = useState(0);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    if (locale === null) {
      setHeld(UNHELD);
      return;
    }
    let cancelled = false;
    void rpcClient.call("key.context", { locale, key: keyName }).then((response) => {
      if (!cancelled) {
        const next = deriveKeyValueContext(response);
        setHeld((previous) =>
          next.kind === "error" &&
          previous.identity === identity &&
          previous.context.kind === "loaded"
            ? previous
            : { identity, context: next },
        );
        setRetrying(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [identity, locale, keyName, refreshToken, attempt]);

  return {
    context: held.identity === identity ? held.context : LOADING,
    retrying,
    retry: () => {
      setRetrying(true);
      setAttempt((count) => count + 1);
    },
    reload: () => setAttempt((count) => count + 1),
  };
}

export function useLocaleEdit(
  locale: string | null,
  keyName: string,
  refreshToken: number,
  session = 0,
  seed: string | null = null,
): LocaleEdit {
  const identity = draftIdentity(locale, keyName, session);
  const { context, retrying, retry, reload } = useHeldContext(
    identity,
    locale,
    keyName,
    refreshToken,
  );
  const [draftState, setDraftState] = useState<DraftState>(EMPTY_DRAFT);
  const [heldSubmit, setHeldSubmit] = useState<HeldSubmit>(NO_SUBMIT);

  const baseline = context.kind === "loaded" ? (context.target ?? "") : null;
  const current = reconcileDraft(draftState, identity, baseline, seed);
  if (current !== draftState) {
    setDraftState(current);
  }
  const submit = heldSubmit.identity === identity ? heldSubmit.state : IDLE;

  const identityRef = useRef(identity);

  useLayoutEffect(() => {
    identityRef.current = identity;
  });

  useEffect(() => {
    setHeldSubmit(NO_SUBMIT);
  }, [identity]);

  async function save(target: string): Promise<boolean> {
    setHeldSubmit({ identity, state: { kind: "submitting" } });
    const response = await rpcClient.call("translation.editEntry", {
      locale: target,
      key: keyName,
      value: current.text,
    });
    const outcome = deriveEditEntryOutcome(response);
    if (identityRef.current === identity) {
      setHeldSubmit({ identity, state: { kind: "settled", outcome } });
    }
    return outcome.kind === "success";
  }

  return {
    context,
    draft: current.identity === identity ? current.text : "",
    dirty: context.kind === "loaded" && isDraftDirty(current),
    submit,
    setDraft: (next) => setDraftState({ ...current, text: next }),
    retrying,
    retry,
    reload,
    save,
  };
}
