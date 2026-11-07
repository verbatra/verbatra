import type { GlossaryDraftCheck, ReviewReasonCode } from "@verbatra/sdk";
import { Badge, DrawerShell, Section, useDialogA11y } from "@verbatra/ui";
import type { ReactNode, Ref } from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { deriveIntegrityPillView, type IntegrityPillView } from "../client/integrity-pill.js";
import type { KeyRevisionRow } from "../client/key-history.js";
import { hasGlossaryHits, type KeyValueContext } from "../client/key-value-context.js";
import { EditEntryHistory } from "./EditEntryHistory.js";
import { ErrorMessage } from "./ErrorMessage.js";
import { GlossaryHitList, SaveRow, submitFailure, TranslationField } from "./entry-editor-parts.js";
import { KeyDescription } from "./KeyDescription.js";
import { ProvenanceBadge } from "./ProvenanceBadge.js";
import { ReviewReasonChips } from "./ReviewReasonChips.js";
import { TranslationValue } from "./TranslationValue.js";
import { UnsavedPrompt } from "./UnsavedPrompt.js";
import { useBannerAnchor } from "./use-banner-anchor.js";
import { useDialogDraftGuard } from "./use-dialog-draft-guard.js";
import { useDraftCheck } from "./use-draft-check.js";
import { useKeyIntegrity } from "./use-key-integrity.js";
import { useLocaleEdit } from "./use-locale-edit.js";

interface Replacing {
  readonly commit: string;
  readonly value: string;
}

type LoadedContext = Extract<KeyValueContext, { kind: "loaded" }>;

export interface EditEntryDialogProps {
  readonly locale: string;
  readonly keyName: string;
  readonly onClose: () => void;
  readonly onAccepted: (locale: string, keyName: string) => void;
  readonly focusTranslation?: boolean;
  readonly refreshToken?: number;
  readonly reviewReasons?: readonly ReviewReasonCode[];
}

function SourceColumn({
  context,
  locale,
  check,
  reviewReasons,
}: {
  readonly context: LoadedContext;
  readonly locale: string;
  readonly check: GlossaryDraftCheck | undefined;
  readonly reviewReasons: readonly ReviewReasonCode[] | undefined;
}): ReactNode {
  return (
    <div className="min-w-0">
      <Section title="Source">
        <TranslationValue
          as="p"
          value={context.source}
          highlightTokens
          className="m-0 whitespace-pre-wrap break-words text-sm text-foreground"
          data-edit-source=""
        />
      </Section>
      {reviewReasons !== undefined && reviewReasons.length > 0 ? (
        <Section title="Flagged for review">
          <ReviewReasonChips reasons={reviewReasons} />
        </Section>
      ) : null}
      <KeyDescription description={context.description} />
      {hasGlossaryHits(context.glossary) ? (
        <Section title="Glossary">
          <GlossaryHitList glossary={context.glossary} locale={locale} check={check} />
        </Section>
      ) : null}
    </div>
  );
}

function SavedValueStatus({
  context,
  pill,
}: {
  readonly context: LoadedContext;
  readonly pill: IntegrityPillView | null;
}): ReactNode {
  if (context.target === undefined) {
    return null;
  }
  return (
    <div className="mb-2 flex flex-wrap items-center gap-2" data-saved-value-status="">
      <span className="text-xs text-muted-foreground">Current value</span>
      <ProvenanceBadge provenance={context.provenance} />
      {pill !== null ? <Badge tone={pill.tone}>{pill.label}</Badge> : null}
    </div>
  );
}

function TranslationColumn({
  locale,
  keyName,
  context,
  value,
  onChangeValue,
  onSave,
  busy,
  textAreaRef,
}: {
  readonly locale: string;
  readonly keyName: string;
  readonly context: LoadedContext;
  readonly value: string;
  readonly onChangeValue: (next: string) => void;
  readonly onSave: () => void;
  readonly busy: boolean;
  readonly textAreaRef: Ref<HTMLTextAreaElement>;
}): ReactNode {
  const integrity = useKeyIntegrity(keyName, 0);
  const pill =
    integrity.kind === "loaded" ? deriveIntegrityPillView(integrity.locales, locale) : null;
  return (
    <div className="min-w-0">
      <Section title="Translation">
        <SavedValueStatus context={context} pill={pill} />
        {context.target === undefined ? (
          <p className="mb-2 text-sm text-muted-foreground">
            No translation exists yet for this locale.
          </p>
        ) : null}
        <TranslationField
          keyName={keyName}
          locale={locale}
          value={value}
          source={context.source}
          maxLength={context.maxLength}
          invalid={pill?.tone === "danger" && value === context.target}
          busy={busy}
          textAreaRef={textAreaRef}
          rows={6}
          onChange={onChangeValue}
          onSave={onSave}
        />
      </Section>
    </div>
  );
}

export function EditEntryDialog({
  locale,
  keyName,
  onClose,
  onAccepted,
  focusTranslation = false,
  reviewReasons,
  refreshToken = 0,
}: EditEntryDialogProps): ReactNode {
  const edit = useLocaleEdit(locale, keyName, refreshToken);
  const [replacing, setReplacing] = useState<Replacing | null>(null);
  const { context, submit } = edit;
  const value = edit.draft;
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);
  const guard = useDialogDraftGuard({
    dirty: edit.dirty,
    saving: submit.kind === "submitting",
    onClose,
    fieldRef: textAreaRef,
  });
  const { confirming } = guard;

  useEffect(() => {
    if (confirming) {
      setReplacing(null);
    }
  }, [confirming]);

  function loadRestored(value: string): void {
    setReplacing(null);
    edit.setDraft(value);
    textAreaRef.current?.focus();
  }

  function requestRestore(revision: KeyRevisionRow): void {
    if (edit.dirty) {
      setReplacing({ commit: revision.commit, value: revision.value });
    } else {
      loadRestored(revision.value);
    }
  }

  function keepDraft(): void {
    const commit = replacing?.commit;
    setReplacing(null);
    const row =
      commit === undefined
        ? null
        : document.querySelector<HTMLElement>(`[data-focus-id="restore:${CSS.escape(commit)}"]`);
    (row ?? textAreaRef.current)?.focus();
  }

  function requestClose(): void {
    if (replacing !== null) {
      keepDraft();
    } else {
      guard.requestClose();
    }
  }

  const containerRef = useDialogA11y<HTMLDivElement>({
    isOpen: true,
    onClose: requestClose,
    ...(focusTranslation ? { initialFocus: textAreaRef } : {}),
  });
  useBannerAnchor(containerRef, replacing !== null);
  const draftCheck = useDraftCheck(
    locale,
    keyName,
    value,
    context.kind === "loaded" && hasGlossaryHits(context.glossary),
  );

  function revealField(): void {
    const field = textAreaRef.current;
    const sticky = containerRef.current?.querySelector<HTMLElement>("[data-sticky]");
    field?.style.setProperty("scroll-margin-top", `${(sticky?.offsetHeight ?? 0) + 8}px`);
    field?.focus();
    field?.scrollIntoView?.({ block: "start" });
  }

  const rejected = submitFailure(submit) !== null;
  const revealRef = useRef({ reveal: revealField, confirming });
  useLayoutEffect(() => {
    revealRef.current = { reveal: revealField, confirming };
  });
  useEffect(() => {
    if (rejected && revealRef.current.confirming) {
      revealRef.current.reveal();
    }
  }, [rejected, submit]);

  async function handleSubmit(): Promise<void> {
    if (await edit.save(locale)) {
      const proceed = guard.takeHeldRoute();
      onAccepted(locale, keyName);
      void proceed?.();
      return;
    }
    textAreaRef.current?.focus();
  }

  const recoveredRef = useRef(false);
  useEffect(() => {
    if (context.kind === "error") {
      recoveredRef.current = true;
    } else if (context.kind === "loaded" && recoveredRef.current) {
      recoveredRef.current = false;
      textAreaRef.current?.focus();
    }
  }, [context.kind]);

  return (
    <DrawerShell
      size="wide"
      kicker="Edit translation"
      title={
        <>
          {keyName} <span className="text-sm text-muted-foreground">({locale})</span>
        </>
      }
      ariaLabel={`Edit ${keyName} in ${locale}`}
      closeLabel={`Close the editor for ${keyName}`}
      onClose={requestClose}
      containerRef={containerRef}
      banner={
        replacing !== null ? (
          <UnsavedPrompt
            subject={
              <>
                The <span className="font-mono">{locale}</span> translation has changes that are not
                saved. Restoring replaces them.
              </>
            }
            saving={false}
            error={null}
            placement="drawer"
            discardLabel="Discard draft and restore"
            escapeKeepsEditing
            onDiscard={() => loadRestored(replacing.value)}
            onKeepEditing={keepDraft}
          />
        ) : confirming ? (
          <UnsavedPrompt
            subject={
              <>
                The <span className="font-mono">{locale}</span> translation has changes that are not
                saved.
              </>
            }
            saving={submit.kind === "submitting"}
            error={submitFailure(submit)}
            placement="drawer"
            onSave={() => void handleSubmit()}
            onDiscard={guard.discard}
            onKeepEditing={guard.keepEditing}
          />
        ) : undefined
      }
    >
      {context.kind === "loading" ? (
        <p className="mb-3 text-sm text-muted-foreground">Loading current value…</p>
      ) : null}
      {context.kind === "error" ? (
        <ErrorMessage error={context.error} retrying={edit.retrying} onRetry={edit.retry} />
      ) : null}
      {context.kind === "loaded" ? (
        <>
          <div className="grid gap-x-8 md:grid-cols-2">
            <SourceColumn
              context={context}
              locale={locale}
              check={draftCheck}
              reviewReasons={reviewReasons}
            />
            <TranslationColumn
              locale={locale}
              keyName={keyName}
              context={context}
              value={value}
              onChangeValue={edit.setDraft}
              onSave={() => void handleSubmit()}
              busy={submit.kind === "submitting"}
              textAreaRef={textAreaRef}
            />
          </div>
          <SaveRow
            submit={confirming && submitFailure(submit) !== null ? { kind: "idle" } : submit}
            onSave={() => void handleSubmit()}
            primary={!confirming && replacing === null}
          />
          <EditEntryHistory
            locale={locale}
            keyName={keyName}
            current={{ kind: "known", value: context.target }}
            refreshToken={refreshToken}
            onRestore={requestRestore}
          />
        </>
      ) : null}
    </DrawerShell>
  );
}
