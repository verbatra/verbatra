import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { deriveEditEntryOutcome, type EditEntryOutcome } from "../client/edit-entry-outcome.js";
import { deriveKeyValueContext, type KeyValueContext } from "../client/key-value-context.js";
import { settledActionStatusLabel } from "../client/settled-action-status.js";
import { rpcClient } from "./api.js";
import { Button } from "./Button.js";
import { TextArea } from "./Input.js";
import { actionStatusTextClassName, settledOutcomeTone } from "./lib/action-status-classes.js";
import { TranslationValue, valueDirection } from "./TranslationValue.js";
import { DrawerShell, Section } from "./ui.js";
import { useDialogA11y } from "./use-dialog-a11y.js";

type SubmitState =
  | { readonly kind: "idle" }
  | { readonly kind: "submitting" }
  | { readonly kind: "settled"; readonly outcome: EditEntryOutcome };

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
    void rpcClient.call("key.value", { locale, key: keyName }).then((response) => {
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

function EditorFields({
  locale,
  context,
  value,
  onChangeValue,
  disabled,
}: {
  readonly locale: string;
  readonly context: Extract<KeyValueContext, { kind: "loaded" }>;
  readonly value: string;
  readonly onChangeValue: (next: string) => void;
  readonly disabled: boolean;
}): ReactNode {
  return (
    <>
      <Section title="Source">
        <TranslationValue
          as="p"
          value={context.source}
          className="m-0 break-words font-mono text-sm text-muted-foreground"
        />
      </Section>
      <Section title="Translation">
        {context.target === undefined ? (
          <p className="mb-2 text-sm text-muted-foreground">
            No translation exists yet for this locale.
          </p>
        ) : null}
        <TextArea
          aria-label={`Translation for ${context.source}`}
          className="max-w-none"
          dir={valueDirection(locale)}
          value={value}
          onChange={(event) => onChangeValue(event.target.value)}
          disabled={disabled}
          rows={5}
        />
      </Section>
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
          <EditorFields
            locale={locale}
            context={context}
            value={value}
            onChangeValue={setValue}
            disabled={submit.kind === "submitting"}
          />
          <span className="mt-2 flex items-center gap-3">
            <Button
              variant="primary"
              size="md"
              disabled={submit.kind === "submitting"}
              onClick={() => void handleSubmit()}
            >
              Save
            </Button>
            {submit.kind !== "idle" ? (
              <span className={submitStatusClassName(submit)}>{submitStatusLabel(submit)}</span>
            ) : null}
          </span>
          {clearRemediationHint(submit) !== undefined ? (
            <p className="mt-2 text-sm text-muted-foreground">{clearRemediationHint(submit)}</p>
          ) : null}
        </>
      ) : null}
    </DrawerShell>
  );
}
