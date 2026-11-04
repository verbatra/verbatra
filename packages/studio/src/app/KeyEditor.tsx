import { DrawerShell, Section, useDialogA11y } from "@verbatra/ui";
import type { ReactNode } from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { DiffLocale } from "../client/diff-view.js";
import { deriveKeyLocaleStatus } from "../client/diff-view.js";
import { deriveIntegrityPillView } from "../client/integrity-pill.js";
import { CommitList } from "./CommitList.js";
import { EditorPane } from "./EditorPane.js";
import { KeyDescription } from "./KeyDescription.js";
import { LocaleBlock } from "./KeyEditorLocale.js";
import { LocaleEditForm } from "./LocaleEditForm.js";
import { installRouteGuard } from "./route-guard.js";
import { TranslationValue } from "./TranslationValue.js";
import { UnsavedPrompt } from "./UnsavedPrompt.js";
import { useCapabilities } from "./use-capabilities.js";
import { useHistoryList } from "./use-history-list.js";
import { useKeyIntegrity } from "./use-key-integrity.js";
import { useKeyValues } from "./use-key-values.js";
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
}

interface Pending {
  readonly proceed: () => void;
  readonly route: boolean;
}

interface EditTarget {
  readonly keyName: string;
  readonly locale: string | null;
}

const CONTROL = "button, a[href], input, select, textarea";

const EDITOR_SURFACE = "[data-editor-pane], [role='dialog']";

function isOutsideControl(element: HTMLElement): boolean {
  return (
    element.isConnected && element.matches(CONTROL) && element.closest(EDITOR_SURFACE) === null
  );
}

function SourceValue({
  source,
  loading,
}: {
  readonly source: string | undefined;
  readonly loading: boolean;
}): ReactNode {
  if (source !== undefined) {
    return (
      <TranslationValue as="p" value={source} className="m-0 break-words text-sm text-foreground" />
    );
  }
  return (
    <p className="m-0 text-sm text-muted-foreground">
      {loading ? "Loading value…" : "No current source value."}
    </p>
  );
}

function useEditTarget(keyName: string): readonly [string | null, (locale: string | null) => void] {
  const [target, setTarget] = useState<EditTarget>({ keyName, locale: null });
  return [
    target.keyName === keyName ? target.locale : null,
    (locale) => setTarget({ keyName, locale }),
  ];
}

export function KeyEditor({
  keyName,
  locales,
  refreshToken,
  layout,
  onClose,
  onEscape,
  onRouteSettled,
}: KeyEditorProps): ReactNode {
  const history = useHistoryList(refreshToken);
  const integrity = useKeyIntegrity(keyName, refreshToken);
  const capabilitiesState = useCapabilities();
  const [editingLocale, setEditingLocale] = useEditTarget(keyName);
  const [pending, setPending] = useState<Pending | null>(null);
  const [saved, setSaved] = useState<EditTarget | null>(null);
  const [returnTo, setReturnTo] = useState<string | null>(null);
  const originRef = useRef<HTMLElement | null>(null);
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const dirtyRef = useRef(false);
  const edit = useLocaleEdit(editingLocale, keyName, refreshToken);
  const dialogRef = useDialogA11y<HTMLDivElement>({ isOpen: layout === "drawer", onClose });

  const rows = deriveKeyLocaleStatus(locales, keyName);
  const values = useKeyValues(
    keyName,
    rows.map((row) => row.locale),
    refreshToken,
  );
  const integrityLocales = integrity.kind === "loaded" ? integrity.locales : [];
  const capabilities =
    capabilitiesState.kind === "loaded" ? capabilitiesState.capabilities : undefined;

  useLayoutEffect(() => {
    dirtyRef.current = edit.dirty;
  });

  useEffect(
    () =>
      installRouteGuard({
        isDirty: () => dirtyRef.current,
        onBlock: (proceed) => {
          originRef.current =
            document.activeElement instanceof HTMLElement ? document.activeElement : null;
          setPending({ proceed, route: true });
        },
      }),
    [],
  );

  useEffect(() => {
    if (returnTo === null) {
      return;
    }
    const buttons = bodyRef.current?.querySelectorAll<HTMLElement>("[data-edit-locale]") ?? [];
    [...buttons].find((button) => button.dataset.editLocale === returnTo)?.focus();
    setReturnTo(null);
  }, [returnTo]);

  function cancelEditing(locale: string): void {
    setEditingLocale(null);
    setReturnTo(locale);
  }

  async function saveEditing(returnFocus: boolean): Promise<boolean> {
    if (editingLocale === null) {
      return false;
    }
    const saved = await edit.save();
    if (saved) {
      setSaved({ keyName, locale: editingLocale });
      setEditingLocale(null);
      if (returnFocus) {
        setReturnTo(editingLocale);
      }
    }
    return saved;
  }

  function startEditing(locale: string): void {
    const open = (): void => {
      setSaved(null);
      setEditingLocale(locale);
    };
    if (edit.dirty) {
      setPending({ proceed: open, route: false });
      return;
    }
    open();
  }

  function returnFocusAfterRoute(): void {
    const origin = originRef.current;
    if (origin !== null && isOutsideControl(origin)) {
      origin.focus();
    } else if (layout === "pane") {
      onRouteSettled();
    }
  }

  function proceedWith(held: Pending | null): void {
    held?.proceed();
    if (held?.route === true) {
      returnFocusAfterRoute();
    }
  }

  async function resolveSave(): Promise<void> {
    const held = pending;
    setPending(null);
    if (await saveEditing(held === null)) {
      proceedWith(held);
    }
  }

  function resolveDiscard(): void {
    const held = pending;
    setPending(null);
    setEditingLocale(null);
    proceedWith(held);
  }

  function keepEditing(): void {
    setPending(null);
    textAreaRef.current?.focus();
  }

  const body = (
    <div ref={bodyRef}>
      {pending !== null && editingLocale !== null ? (
        <UnsavedPrompt
          locale={editingLocale}
          saving={edit.submit.kind === "submitting"}
          onSave={() => void resolveSave()}
          onDiscard={resolveDiscard}
          onKeepEditing={keepEditing}
        />
      ) : null}
      <Section title="Source">
        <SourceValue
          source={values.kind === "loaded" ? values.source : undefined}
          loading={values.kind === "loading"}
        />
      </Section>
      <KeyDescription description={values.kind === "loaded" ? values.description : undefined} />
      <Section title="Locales">
        <ul className="m-0 list-none p-0">
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
                  textAreaRef={textAreaRef}
                  onSave={() => void saveEditing(true)}
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
    </div>
  );

  if (layout === "pane") {
    return (
      <EditorPane keyName={keyName} onClose={onClose} onEscape={onEscape}>
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
    >
      {body}
    </DrawerShell>
  );
}
