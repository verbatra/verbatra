import type { GlossaryDraftCheck, ReviewReasonCode } from "@verbatra/sdk";
import { Badge, DrawerShell, Section, useDialogA11y } from "@verbatra/ui";
import type { ReactNode, Ref } from "react";
import { useEffect, useRef, useState } from "react";
import { deriveEditEntryOutcome } from "../client/edit-entry-outcome.js";
import { deriveIntegrityPillView, type IntegrityPillView } from "../client/integrity-pill.js";
import {
  deriveKeyValueContext,
  hasGlossaryHits,
  type KeyValueContext,
} from "../client/key-value-context.js";
import { rpcClient } from "./api.js";
import {
  GlossaryHitList,
  SaveRow,
  type SubmitState,
  TranslationField,
} from "./entry-editor-parts.js";
import { KeyDescription } from "./KeyDescription.js";
import { ProvenanceBadge } from "./ProvenanceBadge.js";
import { ReviewReasonChips } from "./ReviewReasonChips.js";
import { TranslationValue } from "./TranslationValue.js";
import { useDraftCheck } from "./use-draft-check.js";
import { useKeyIntegrity } from "./use-key-integrity.js";

type LoadedContext = Extract<KeyValueContext, { kind: "loaded" }>;

export interface EditEntryDialogProps {
  readonly locale: string;
  readonly keyName: string;
  readonly onClose: () => void;
  readonly onAccepted: (locale: string, keyName: string) => void;
  readonly focusTranslation?: boolean;
  readonly reviewReasons?: readonly ReviewReasonCode[];
}

function useKeyValueContext(locale: string, keyName: string): KeyValueContext {
  const [state, setState] = useState<KeyValueContext>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    void rpcClient.call("key.context", { locale, key: keyName }).then((response) => {
      if (!cancelled) {
        setState(deriveKeyValueContext(response));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [locale, keyName]);

  return state;
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
  disabled,
  textAreaRef,
}: {
  readonly locale: string;
  readonly keyName: string;
  readonly context: LoadedContext;
  readonly value: string;
  readonly onChangeValue: (next: string) => void;
  readonly onSave: () => void;
  readonly disabled: boolean;
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
          locale={locale}
          value={value}
          source={context.source}
          maxLength={context.maxLength}
          invalid={pill?.tone === "danger" && value === context.target}
          disabled={disabled}
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
}: EditEntryDialogProps): ReactNode {
  const context = useKeyValueContext(locale, keyName);
  const [value, setValue] = useState("");
  const [submit, setSubmit] = useState<SubmitState>({ kind: "idle" });
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);
  const containerRef = useDialogA11y<HTMLDivElement>({
    isOpen: true,
    onClose,
    ...(focusTranslation ? { initialFocus: textAreaRef } : {}),
  });
  const draftCheck = useDraftCheck(
    locale,
    keyName,
    value,
    context.kind === "loaded" && hasGlossaryHits(context.glossary),
  );

  useEffect(() => {
    if (context.kind === "loaded") {
      setValue(context.target ?? "");
    }
  }, [context]);

  async function handleSubmit(): Promise<void> {
    setSubmit({ kind: "submitting" });
    const response = await rpcClient.call("translation.editEntry", {
      locale,
      key: keyName,
      value,
    });
    const outcome = deriveEditEntryOutcome(response);
    setSubmit({ kind: "settled", outcome });
    if (outcome.kind === "success") {
      onAccepted(locale, keyName);
    }
  }

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
      onClose={onClose}
      containerRef={containerRef}
    >
      {context.kind === "loading" ? (
        <p className="mb-3 text-sm text-muted-foreground">Loading current value…</p>
      ) : null}
      {context.kind === "error" ? (
        <p className="mb-3 text-sm text-muted-foreground">{context.message}</p>
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
              onChangeValue={setValue}
              onSave={() => void handleSubmit()}
              disabled={submit.kind === "submitting"}
              textAreaRef={textAreaRef}
            />
          </div>
          <SaveRow submit={submit} onSave={() => void handleSubmit()} />
        </>
      ) : null}
    </DrawerShell>
  );
}
