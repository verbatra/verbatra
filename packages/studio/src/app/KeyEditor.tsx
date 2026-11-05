import { Button, DrawerShell, Section, useDialogA11y } from "@verbatra/ui";
import type { ReactNode } from "react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { DiffLocale } from "../client/diff-view.js";
import { deriveKeyLocaleStatus } from "../client/diff-view.js";
import { deriveIntegrityPillView } from "../client/integrity-pill.js";
import { settledActionStatusLabel } from "../client/settled-action-status.js";
import type { StructuredError } from "../client/state.js";
import { CommitList } from "./CommitList.js";
import { EditorPane } from "./EditorPane.js";
import { ErrorMessage } from "./ErrorMessage.js";
import type { SubmitState } from "./entry-editor-parts.js";
import { KeyDescription } from "./KeyDescription.js";
import { LocaleBlock } from "./KeyEditorLocale.js";
import { LocaleEditForm } from "./LocaleEditForm.js";
import { cn } from "./lib/cn.js";
import {
  hasHeldRoute,
  installRouteGuard,
  restoreHeldRoute,
  setUnloadWarning,
} from "./route-guard.js";
import { TranslationValue } from "./TranslationValue.js";
import { UnsavedPrompt } from "./UnsavedPrompt.js";
import { useCapabilities } from "./use-capabilities.js";
import { useHistoryList } from "./use-history-list.js";
import { type KeyIntegrityState, useKeyIntegrity } from "./use-key-integrity.js";
import { type KeyValuesState, useKeyValues } from "./use-key-values.js";
import { useLocaleEdit } from "./use-locale-edit.js";

export type KeyEditorLayout = "pane" | "drawer";

export interface KeyEditorProps {
  readonly keyName: string;
  readonly locales: readonly DiffLocale[];
  readonly refreshToken: number;
  readonly layout: KeyEditorLayout;
  readonly onClose: () => void;
  readonly onEscape: () => void;
  readonly onRouteSettled: () => void;
  readonly missing: boolean;
  readonly onDirtyChange: (dirty: boolean) => void;
}

interface Pending {
  readonly proceed: () => Promise<void>;
  readonly route: boolean;
}

interface EditTarget {
  readonly keyName: string;
  readonly locale: string | null;
}

interface EditSession extends EditTarget {
  readonly session: number;
}

const RECOVERY_FOCUS =
  "scroll-mt-28 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring";

const NOT_FOUND = "UNKNOWN_KEY";

const CONTROL = "button, a[href], input, select, textarea";

const EDITOR_SURFACE = "[data-editor-pane], [role='dialog']";

function isOutsideControl(element: Element | null): element is HTMLElement {
  return (
    element instanceof HTMLElement &&
    element.isConnected &&
    element.matches(CONTROL) &&
    element.closest(EDITOR_SURFACE) === null
  );
}

function SourceValue({
  values,
  suppressError,
  retrying,
  onRetry,
}: {
  readonly values: KeyValuesState;
  readonly suppressError: boolean;
  readonly retrying: boolean;
  readonly onRetry: () => void;
}): ReactNode {
  if (values.kind === "error") {
    return suppressError && values.error.code === NOT_FOUND ? null : (
      <ErrorMessage error={values.error} retrying={retrying} onRetry={onRetry} />
    );
  }
  if (values.kind === "loaded" && values.source !== undefined) {
    return (
      <TranslationValue
        as="p"
        value={values.source}
        className="m-0 break-words text-sm text-foreground"
      />
    );
  }
  return (
    <p className="m-0 text-sm text-muted-foreground">
      {values.kind === "loading" ? "Loading value…" : "No current source value."}
    </p>
  );
}

type Recovery =
  | { readonly target: "source"; readonly from: KeyValuesState }
  | { readonly target: "locales"; readonly from: KeyIntegrityState };

function sameFailure(values: KeyValuesState, error: StructuredError): boolean {
  return (
    values.kind === "error" &&
    values.error.code === error.code &&
    values.error.message === error.message
  );
}

function submitFailure(submit: SubmitState): StructuredError | null {
  if (submit.kind !== "settled" || submit.outcome.kind === "success") {
    return null;
  }
  return { code: "SAVE_NOT_ACCEPTED", message: settledActionStatusLabel(submit.outcome, "Saved") };
}

function MissingKeyNotice({ onDiscard }: { readonly onDiscard: () => void }): ReactNode {
  return (
    <div
      role="status"
      data-key-missing=""
      className="mb-6 flex flex-wrap items-center gap-3 rounded-lg border border-warning p-3 text-sm text-foreground"
    >
      <span className="min-w-0 flex-1">
        This key no longer exists in the source or the locale files. Your draft is kept until you
        discard it.
      </span>
      <Button size="sm" onClick={onDiscard}>
        Discard
      </Button>
    </div>
  );
}

function useEditSession(keyName: string): {
  readonly locale: string | null;
  readonly session: number;
  open(locale: string): void;
  close(): void;
} {
  const [target, setTarget] = useState<EditSession>({ keyName, locale: null, session: 0 });
  const counter = useRef(0);
  let current = target;
  if (target.keyName !== keyName) {
    counter.current += 1;
    current = { keyName, locale: null, session: counter.current };
    setTarget(current);
  }
  return {
    locale: current.locale,
    session: current.session,
    open: (locale) => {
      counter.current += 1;
      setTarget({ keyName, locale, session: counter.current });
    },
    close: () => setTarget({ keyName, locale: null, session: current.session }),
  };
}

export function KeyEditor({
  keyName,
  locales,
  refreshToken,
  layout,
  onClose,
  onEscape,
  onRouteSettled,
  missing,
  onDirtyChange,
}: KeyEditorProps): ReactNode {
  const history = useHistoryList(refreshToken);
  const [integrityAttempt, setIntegrityAttempt] = useState(0);
  const [integrityRetrying, setIntegrityRetrying] = useState(false);
  const retryIntegrity = (): void => {
    setIntegrityRetrying(true);
    setIntegrityAttempt((count) => count + 1);
  };
  const integrity = useKeyIntegrity(keyName, refreshToken, integrityAttempt);
  const capabilitiesState = useCapabilities();
  const {
    locale: editingLocale,
    session,
    open: openLocale,
    close: closeLocale,
  } = useEditSession(keyName);
  const [pending, setPending] = useState<Pending | null>(null);
  const pendingRef = useRef<Pending | null>(null);
  pendingRef.current = pending;
  const [saved, setSaved] = useState<EditTarget | null>(null);
  const [returnTo, setReturnTo] = useState<string | null>(null);
  const originRef = useRef<Element | null>(null);
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);
  const dirtyRef = useRef(false);
  const editingRef = useRef<EditSession>({ keyName, locale: null, session: 0 });
  const resolvedRef = useRef(false);
  const recoveryRef = useRef<Recovery | null>(null);
  const sourceTargetRef = useRef<HTMLDivElement | null>(null);
  const localesTargetRef = useRef<HTMLUListElement | null>(null);
  const edit = useLocaleEdit(editingLocale, keyName, refreshToken, session);
  const dialogRef = useDialogA11y<HTMLDivElement>({ isOpen: layout === "drawer", onClose });

  const rows = deriveKeyLocaleStatus(locales, keyName);
  const {
    values,
    retrying: valuesRetrying,
    retry: retryValues,
  } = useKeyValues(
    keyName,
    rows.map((row) => row.locale),
    refreshToken,
  );
  const integrityLocales = integrity.kind === "loaded" ? integrity.locales : [];
  const capabilities =
    capabilitiesState.kind === "loaded" ? capabilitiesState.capabilities : undefined;

  const dirtyReportRef = useRef(onDirtyChange);
  const selectionRef = useRef<{ readonly start: number; readonly end: number } | null>(null);

  const attachField = useCallback((node: HTMLTextAreaElement | null) => {
    textAreaRef.current = node;
    return () => {
      selectionRef.current =
        node !== null && document.activeElement === node
          ? { start: node.selectionStart, end: node.selectionEnd }
          : null;
    };
  }, []);

  useLayoutEffect(() => {
    editingRef.current = { keyName, locale: editingLocale, session };
    dirtyRef.current = edit.dirty;
    dirtyReportRef.current = onDirtyChange;
  });

  useEffect(() => {
    const selection = selectionRef.current;
    const field = textAreaRef.current;
    if (selection !== null && field !== null) {
      field.focus();
      field.setSelectionRange(selection.start, selection.end);
    }
    selectionRef.current = null;
  }, [layout]);

  useEffect(() => {
    const armed = recoveryRef.current;
    if (armed === null) {
      return;
    }
    const answer = armed.target === "source" ? values : integrity;
    if (answer === armed.from) {
      return;
    }
    recoveryRef.current = null;
    if (answer.kind !== "loaded") {
      return;
    }
    (armed.target === "source" ? sourceTargetRef : localesTargetRef).current?.focus();
  }, [values, integrity]);

  useEffect(() => {
    setIntegrityRetrying(false);
  }, [integrity]);

  useEffect(() => {
    dirtyReportRef.current(edit.dirty);
    setUnloadWarning(edit.dirty);
  }, [edit.dirty]);

  useEffect(() => {
    if (edit.dirty || edit.submit.kind === "submitting") {
      return;
    }
    if (resolvedRef.current) {
      if (pending !== null) {
        proceedWith(pending);
      }
    } else {
      restoreHeldRoute();
    }
    setPending(null);
    resolvedRef.current = false;
  }, [edit.dirty, edit.submit.kind]);

  useEffect(() => () => dirtyReportRef.current(false), []);

  useEffect(
    () =>
      installRouteGuard({
        isDirty: () => dirtyRef.current,
        onBlock: (proceed) => {
          originRef.current = document.activeElement;
          resolvedRef.current = false;
          setPending({ proceed, route: true });
        },
        onRelease: () => {
          pendingRef.current = null;
          setPending(null);
          textAreaRef.current?.focus();
        },
      }),
    [],
  );

  useEffect(() => {
    if (returnTo === null) {
      return;
    }
    [...document.querySelectorAll<HTMLElement>("[data-edit-locale]")]
      .find((button) => button.dataset.editLocale === returnTo)
      ?.focus();
    setReturnTo(null);
  }, [returnTo]);

  function cancelEditing(locale: string): void {
    resolvedRef.current = true;
    closeLocale();
    if (pendingRef.current === null) {
      setReturnTo(locale);
    }
  }

  async function saveEditing(locale: string): Promise<boolean> {
    const saved = await edit.save(locale);
    const here =
      editingRef.current.session === session &&
      editingRef.current.keyName === keyName &&
      editingRef.current.locale === locale;
    if (!here) {
      return false;
    }
    if (!saved) {
      textAreaRef.current?.focus();
      return false;
    }
    resolvedRef.current = true;
    setSaved({ keyName, locale });
    closeLocale();
    if (pendingRef.current === null) {
      setReturnTo(locale);
    }
    return true;
  }

  function startEditing(locale: string): void {
    const open = (): Promise<void> => {
      setSaved(null);
      openLocale(locale);
      return Promise.resolve();
    };
    if (edit.dirty) {
      restoreHeldRoute();
      resolvedRef.current = false;
      setPending({ proceed: open, route: false });
      return;
    }
    open();
  }

  function returnFocusAfterRoute(): void {
    const origin = originRef.current;
    if (isOutsideControl(origin)) {
      origin.focus();
    } else if (layout === "pane" || missing) {
      onRouteSettled();
    }
  }

  function proceedWith(held: Pending): void {
    void held.proceed();
    if (held.route) {
      returnFocusAfterRoute();
    }
  }

  function resolveDiscard(): void {
    resolvedRef.current = true;
    closeLocale();
  }

  function discardMissing(): void {
    const waiting = pending !== null || hasHeldRoute();
    resolvedRef.current = true;
    closeLocale();
    if (!waiting) {
      dirtyRef.current = false;
      onClose();
    }
  }

  function keepEditing(): void {
    restoreHeldRoute();
    setPending(null);
    textAreaRef.current?.focus();
  }

  const prompt =
    pending !== null && editingLocale !== null ? (
      <UnsavedPrompt
        locale={editingLocale}
        saving={edit.submit.kind === "submitting"}
        error={submitFailure(edit.submit)}
        placement={layout}
        onSave={() => void saveEditing(editingLocale)}
        onDiscard={resolveDiscard}
        onKeepEditing={keepEditing}
      />
    ) : null;

  const body = (
    <>
      {missing ? <MissingKeyNotice onDiscard={discardMissing} /> : null}
      <Section title="Source">
        <div
          ref={sourceTargetRef}
          tabIndex={-1}
          data-recovery-target="source"
          className={RECOVERY_FOCUS}
        >
          <SourceValue
            values={values}
            suppressError={missing}
            retrying={valuesRetrying}
            onRetry={() => {
              recoveryRef.current = { target: "source", from: values };
              retryValues();
              if (integrity.kind === "error" && sameFailure(values, integrity.error)) {
                retryIntegrity();
              }
            }}
          />
        </div>
      </Section>
      <KeyDescription description={values.kind === "loaded" ? values.description : undefined} />
      <Section title="Locales">
        {integrity.kind === "error" &&
        !(missing && integrity.error.code === NOT_FOUND) &&
        !sameFailure(values, integrity.error) ? (
          <ErrorMessage
            error={integrity.error}
            retrying={integrityRetrying}
            onRetry={() => {
              recoveryRef.current = { target: "locales", from: integrity };
              retryIntegrity();
            }}
          />
        ) : null}
        <ul
          ref={localesTargetRef}
          tabIndex={-1}
          data-recovery-target="locales"
          className={cn("m-0 list-none p-0", RECOVERY_FOCUS)}
        >
          {rows.map((row) => (
            <LocaleBlock
              key={row.locale}
              row={row}
              keyName={keyName}
              integrity={integrityLocales}
              capabilities={capabilities}
              values={values}
              editing={row.locale === editingLocale}
              savedNote={
                saved?.keyName === keyName && saved.locale === row.locale && editingLocale === null
              }
              onEdit={() => startEditing(row.locale)}
              form={
                <LocaleEditForm
                  locale={row.locale}
                  keyName={keyName}
                  edit={edit}
                  pill={deriveIntegrityPillView(integrityLocales, row.locale)}
                  attachField={attachField}
                  promptOpen={prompt !== null}
                  onSave={() => void saveEditing(row.locale)}
                  onCancel={() => cancelEditing(row.locale)}
                />
              }
            />
          ))}
        </ul>
      </Section>
      <Section
        title="History"
        intro="Commit history for this project's locale files, not filtered to this key."
      >
        <CommitList
          state={history}
          compact
          emptyMessage="No commit history yet for the locale files."
        />
      </Section>
    </>
  );

  if (layout === "pane") {
    return (
      <EditorPane keyName={keyName} banner={prompt} onClose={onClose} onEscape={onEscape}>
        {body}
      </EditorPane>
    );
  }
  return (
    <DrawerShell
      kicker="Key details"
      title={keyName}
      ariaLabel={`Details for ${keyName}`}
      closeLabel={`Close details for ${keyName}`}
      onClose={onClose}
      containerRef={dialogRef}
      banner={prompt}
    >
      <div data-drawer-tail="" className="pb-40">
        {body}
      </div>
    </DrawerShell>
  );
}
