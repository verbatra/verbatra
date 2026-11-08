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
import type { StructuredError } from "../client/state.js";
import { rpcClient } from "./api.js";
import { type SubmitState, submitFailure } from "./entry-editor-parts.js";
import { type LimitDraft, useLimitDraft } from "./use-limit-draft.js";

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
  readonly valueDirty: boolean;
  readonly writesValue: boolean;
  readonly saving: boolean;
  readonly promptError: StructuredError | null;
  readonly limit: LimitDraft;
  readonly readFailure: StructuredError | null;
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
  readonly readFailure: StructuredError | null;
  readonly retrying: boolean;
  retry(): void;
  reload(): void;
} {
  const [held, setHeld] = useState<HeldContext>(UNHELD);
  const [attempt, setAttempt] = useState(0);
  const [retrying, setRetrying] = useState(false);
  const [readFailure, setReadFailure] = useState<StructuredError | null>(null);
  const heldRef = useRef(held);
  heldRef.current = held;

  useEffect(() => {
    if (locale === null) {
      setHeld(UNHELD);
      setReadFailure(null);
      return;
    }
    let cancelled = false;
    void rpcClient.call("key.context", { locale, key: keyName }).then((response) => {
      if (!cancelled) {
        const next = deriveKeyValueContext(response);
        const previous = heldRef.current;
        const keepsPrevious =
          next.kind === "error" &&
          previous.identity === identity &&
          previous.context.kind === "loaded";
        setReadFailure(keepsPrevious && next.kind === "error" ? next.error : null);
        setHeld(keepsPrevious ? previous : { identity, context: next });
        setRetrying(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [identity, locale, keyName, refreshToken, attempt]);

  return {
    context: held.identity === identity ? held.context : LOADING,
    readFailure: held.identity === identity ? readFailure : null,
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
  const { context, readFailure, retrying, retry, reload } = useHeldContext(
    identity,
    locale,
    keyName,
    refreshToken,
  );
  const limit = useLimitDraft({
    identity,
    keyName,
    context: context.kind === "loaded" ? context : null,
    reload,
  });
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

  const valueDirty = context.kind === "loaded" && isDraftDirty(current);

  async function saveValue(target: string): Promise<boolean> {
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

  const writesValue = valueDirty || !limit.dirty;

  async function save(target: string): Promise<boolean> {
    if (writesValue && !(await saveValue(target))) {
      return false;
    }
    return limit.dirty ? limit.save() : true;
  }

  return {
    context,
    draft: current.identity === identity ? current.text : "",
    dirty: valueDirty || limit.dirty,
    valueDirty,
    writesValue,
    saving: submit.kind === "submitting" || limit.saving,
    promptError: submitFailure(submit) ?? limit.failure ?? limit.invalid,
    limit,
    readFailure,
    submit,
    setDraft: (next) => setDraftState({ ...current, text: next }),
    retrying,
    retry,
    reload,
    save,
  };
}
