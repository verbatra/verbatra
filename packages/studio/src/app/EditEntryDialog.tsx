import type { LocaleGlossary } from "@verbatra/sdk";
import type { KeyboardEvent, ReactNode } from "react";
import { useEffect, useState } from "react";
import { deriveEditEntryOutcome, type EditEntryOutcome } from "../client/edit-entry-outcome.js";
import { deriveIntegrityPillView } from "../client/integrity-pill.js";
import {
  deriveKeyValueContext,
  hasGlossaryHits,
  type KeyValueContext,
} from "../client/key-value-context.js";
import { compareLength, lengthComparisonText } from "../client/length-compare.js";
import { settledActionStatusLabel } from "../client/settled-action-status.js";
import { rpcClient } from "./api.js";
import { Badge } from "./Badge.js";
import { Button } from "./Button.js";
import { TextArea } from "./Input.js";
import { actionStatusTextClassName, settledOutcomeTone } from "./lib/action-status-classes.js";
import { cn } from "./lib/cn.js";
import { ProvenanceBadge } from "./ProvenanceBadge.js";
import { TranslationValue, valueDirection } from "./TranslationValue.js";
import { DrawerShell, microLabelClassName, Section } from "./ui.js";
import { useDialogA11y } from "./use-dialog-a11y.js";
import { useKeyIntegrity } from "./use-key-integrity.js";

type SubmitState =
  | { readonly kind: "idle" }
  | { readonly kind: "submitting" }
  | { readonly kind: "settled"; readonly outcome: EditEntryOutcome };

type LoadedContext = Extract<KeyValueContext, { kind: "loaded" }>;

export interface EditEntryDialogProps {
  readonly locale: string;
  readonly keyName: string;
  readonly onClose: () => void;
  readonly onAccepted: (locale: string, keyName: string) => void;
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

function submitStatusLabel(state: SubmitState): string {
  if (state.kind === "submitting") {
    return "Saving…";
  }
  if (state.kind === "settled") {
    return settledActionStatusLabel(state.outcome, "Saved");
  }
  return "";
}

function submitStatusClassName(state: SubmitState): string {
  return actionStatusTextClassName(
    settledOutcomeTone(state.kind === "settled" ? state.outcome : undefined),
  );
}

function clearRemediationHint(state: SubmitState): string | undefined {
  if (state.kind !== "settled" || state.outcome.kind !== "rejected") {
    return undefined;
  }
  if (state.outcome.reason !== "empty") {
    return undefined;
  }
  return (
    "To clear this translation, run verbatra export, type [[CLEAR]] in its Translation cell, " +
    "then run verbatra import."
  );
}

function isSaveShortcut(event: KeyboardEvent<HTMLTextAreaElement>): boolean {
  return event.key === "Enter" && (event.ctrlKey || event.metaKey);
}

function GlossaryHitList({ glossary }: { readonly glossary: LocaleGlossary }): ReactNode {
  return (
    <ul className="m-0 list-none space-y-2 p-0" data-glossary-hits="">
      {glossary.terms.map((term) => (
        <li key={`term ${term.source}`} className="text-sm">
          <span className="font-mono font-semibold text-foreground">{term.source}</span>
          {term.target !== undefined ? (
            <span className="text-muted-foreground">
              {" "}
              use <span className="font-mono text-foreground">{term.target}</span>
            </span>
          ) : null}
          {term.forbidden.length > 0 ? (
            <span className="block text-xs text-danger">Never {term.forbidden.join(", ")}</span>
          ) : null}
          {term.note !== undefined ? (
            <span className="block text-xs text-muted-foreground">{term.note}</span>
          ) : null}
        </li>
      ))}
      {glossary.doNotTranslate.map((entry) => (
        <li key={`fixed ${entry.term}`} className="text-sm">
          <span className="font-mono font-semibold text-foreground">{entry.term}</span>
          <span className="text-muted-foreground"> keep as written</span>
        </li>
      ))}
    </ul>
  );
}

function SourceColumn({ context }: { readonly context: LoadedContext }): ReactNode {
  return (
    <div className="min-w-0">
      <Section title="Source">
        <TranslationValue
          as="p"
          value={context.source}
          highlightTokens
          className="m-0 whitespace-pre-wrap break-words font-mono text-sm text-foreground"
          data-edit-source=""
        />
      </Section>
      {context.description !== undefined ? (
        <Section title="Context">
          <p className="m-0 whitespace-pre-wrap break-words text-sm text-muted-foreground">
            {context.description}
          </p>
        </Section>
      ) : null}
      {hasGlossaryHits(context.glossary) ? (
        <Section title="Glossary">
          <GlossaryHitList glossary={context.glossary} />
        </Section>
      ) : null}
    </div>
  );
}

function SavedValueStatus({
  context,
  locale,
  keyName,
}: {
  readonly context: LoadedContext;
  readonly locale: string;
  readonly keyName: string;
}): ReactNode {
  const integrity = useKeyIntegrity(keyName, 0);
  const pill =
    integrity.kind === "loaded" ? deriveIntegrityPillView(integrity.locales, locale) : null;
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
}: {
  readonly locale: string;
  readonly keyName: string;
  readonly context: LoadedContext;
  readonly value: string;
  readonly onChangeValue: (next: string) => void;
  readonly onSave: () => void;
  readonly disabled: boolean;
}): ReactNode {
  return (
    <div className="min-w-0">
      <Section title="Translation">
        <SavedValueStatus context={context} locale={locale} keyName={keyName} />
        {context.target === undefined ? (
          <p className="mb-2 text-sm text-muted-foreground">
            No translation exists yet for this locale.
          </p>
        ) : null}
        <TextArea
          aria-label={`Translation for ${context.source}`}
          aria-keyshortcuts="Control+Enter Meta+Enter"
          className="max-w-none"
          dir={valueDirection(locale)}
          value={value}
          onChange={(event) => onChangeValue(event.target.value)}
          onKeyDown={(event) => {
            if (isSaveShortcut(event) && !disabled) {
              event.preventDefault();
              onSave();
            }
          }}
          disabled={disabled}
          rows={6}
        />
        <p className="m-0 mt-1 text-xs text-muted-foreground" data-edit-length="">
          {lengthComparisonText(compareLength(context.source, value))}
        </p>
        <figure
          className="m-0 mt-3 rounded-md border border-border bg-muted px-3 py-2"
          data-edit-preview=""
        >
          <figcaption className={cn("mb-1", microLabelClassName)}>Preview</figcaption>
          <TranslationValue
            as="p"
            value={value}
            locale={locale}
            highlightTokens
            className="m-0 min-h-5 whitespace-pre-wrap break-words text-sm text-muted-foreground"
          />
        </figure>
      </Section>
    </div>
  );
}

function SaveRow({
  submit,
  onSave,
}: {
  readonly submit: SubmitState;
  readonly onSave: () => void;
}): ReactNode {
  const hint = clearRemediationHint(submit);
  return (
    <>
      <span className="flex flex-wrap items-center gap-3">
        <Button
          variant="primary"
          size="md"
          disabled={submit.kind === "submitting"}
          onClick={onSave}
        >
          Save
        </Button>
        <span className="text-xs text-muted-foreground">or press Ctrl or Cmd with Enter</span>
        {submit.kind !== "idle" ? (
          <span className={submitStatusClassName(submit)}>{submitStatusLabel(submit)}</span>
        ) : null}
      </span>
      {hint !== undefined ? <p className="mt-2 text-sm text-muted-foreground">{hint}</p> : null}
    </>
  );
}

export function EditEntryDialog({
  locale,
  keyName,
  onClose,
  onAccepted,
}: EditEntryDialogProps): ReactNode {
  const context = useKeyValueContext(locale, keyName);
  const [value, setValue] = useState("");
  const [submit, setSubmit] = useState<SubmitState>({ kind: "idle" });
  const containerRef = useDialogA11y<HTMLDivElement>({ isOpen: true, onClose });

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
            <SourceColumn context={context} />
            <TranslationColumn
              locale={locale}
              keyName={keyName}
              context={context}
              value={value}
              onChangeValue={setValue}
              onSave={() => void handleSubmit()}
              disabled={submit.kind === "submitting"}
            />
          </div>
          <SaveRow submit={submit} onSave={() => void handleSubmit()} />
        </>
      ) : null}
    </DrawerShell>
  );
}
