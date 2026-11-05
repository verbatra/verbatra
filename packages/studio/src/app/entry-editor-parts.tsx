import type { GlossaryDraftCheck, LocaleGlossary } from "@verbatra/sdk";
import { Badge, Button, microLabelClassName, TextArea } from "@verbatra/ui";
import type { KeyboardEvent, ReactNode, Ref } from "react";
import { useId } from "react";
import type { EditEntryOutcome } from "../client/edit-entry-outcome.js";
import {
  type DraftFlag,
  draftFixedTermFlags,
  draftTermFlags,
} from "../client/key-value-context.js";
import { compareLength, lengthSummary } from "../client/length-compare.js";
import { settledActionStatusLabel } from "../client/settled-action-status.js";
import { actionStatusTextClassName, settledOutcomeTone } from "./lib/action-status-classes.js";
import { cn } from "./lib/cn.js";
import { TranslationValue, valueDirection } from "./TranslationValue.js";

export type SubmitState =
  | { readonly kind: "idle" }
  | { readonly kind: "submitting" }
  | { readonly kind: "settled"; readonly outcome: EditEntryOutcome };

function submitStatusLabel(state: Exclude<SubmitState, { kind: "idle" }>): string {
  if (state.kind === "submitting") {
    return "Saving…";
  }
  return settledActionStatusLabel(state.outcome, "Saved");
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

function DraftFlags({ flags }: { readonly flags: readonly DraftFlag[] }): ReactNode {
  if (flags.length === 0) {
    return null;
  }
  return (
    <span className="ms-2 inline-flex flex-wrap gap-1 align-middle" data-draft-flags="">
      {flags.map((flag) => (
        <Badge key={flag.label} tone={flag.tone} verbatim={flag.verbatim === true}>
          {flag.label}
        </Badge>
      ))}
    </span>
  );
}

export function GlossaryHitList({
  glossary,
  locale,
  check,
}: {
  readonly glossary: LocaleGlossary;
  readonly locale: string;
  readonly check: GlossaryDraftCheck | undefined;
}): ReactNode {
  return (
    <ul className="m-0 list-none space-y-2 p-0" data-glossary-hits="">
      {glossary.terms.map((term) => (
        <li key={`term ${term.source}`} className="text-sm">
          <span className="font-semibold text-foreground" dir="auto">
            {term.source}
          </span>
          {term.target !== undefined ? (
            <span className="text-muted-foreground">
              {" "}
              use{" "}
              <span className="text-foreground" lang={locale} dir="auto">
                {term.target}
              </span>
            </span>
          ) : null}
          <DraftFlags
            flags={draftTermFlags(check?.terms.find((entry) => entry.source === term.source))}
          />
          {term.forbidden.length > 0 ? (
            <span className="block text-xs text-muted-foreground" data-glossary-forbidden="">
              Never{" "}
              <span lang={locale} dir="auto">
                {term.forbidden.join(", ")}
              </span>
            </span>
          ) : null}
          {term.note !== undefined ? (
            <span className="block text-xs text-muted-foreground">{term.note}</span>
          ) : null}
        </li>
      ))}
      {glossary.doNotTranslate.map((entry) => (
        <li key={`fixed ${entry.term}`} className="text-sm">
          <span className="font-semibold text-foreground" dir="auto">
            {entry.term}
          </span>
          <span className="text-muted-foreground"> keep as written</span>
          <DraftFlags
            flags={draftFixedTermFlags(
              check?.doNotTranslate.find((candidate) => candidate.term === entry.term),
            )}
          />
        </li>
      ))}
    </ul>
  );
}

function LengthLine({
  id,
  source,
  value,
  maxLength,
}: {
  readonly id: string;
  readonly source: string;
  readonly value: string;
  readonly maxLength: number | undefined;
}): ReactNode {
  const summary = lengthSummary(compareLength(source, value), maxLength);
  return (
    <p
      id={id}
      className={cn(
        "m-0 mt-1 text-xs",
        summary.overBudget ? "font-semibold text-danger" : "text-muted-foreground",
      )}
      data-edit-length=""
      data-over-budget={summary.overBudget ? "" : undefined}
    >
      {summary.text}
    </p>
  );
}

function DraftPreview({
  value,
  locale,
}: {
  readonly value: string;
  readonly locale: string;
}): ReactNode {
  return (
    <figure
      className="m-0 mt-3 rounded-sm border border-border bg-muted px-3 py-2"
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
  );
}

export function TranslationField({
  locale,
  value,
  source,
  maxLength,
  invalid,
  disabled,
  textAreaRef,
  rows,
  onChange,
  onSave,
}: {
  readonly locale: string;
  readonly value: string;
  readonly source: string;
  readonly maxLength: number | undefined;
  readonly invalid: boolean;
  readonly disabled: boolean;
  readonly textAreaRef: Ref<HTMLTextAreaElement>;
  readonly rows: number;
  readonly onChange: (next: string) => void;
  readonly onSave: () => void;
}): ReactNode {
  const lengthId = useId();
  return (
    <>
      <TextArea
        ref={textAreaRef}
        aria-label={`Translation (${locale})`}
        aria-describedby={lengthId}
        aria-invalid={invalid ? true : undefined}
        className="mt-1"
        aria-keyshortcuts="Control+Enter Meta+Enter"
        lang={locale}
        dir={valueDirection(locale, value)}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (isSaveShortcut(event) && !disabled) {
            event.preventDefault();
            onSave();
          }
        }}
        disabled={disabled}
        rows={rows}
      />
      <LengthLine id={lengthId} source={source} value={value} maxLength={maxLength} />
      <DraftPreview value={value} locale={locale} />
    </>
  );
}

export function SaveRow({
  submit,
  onSave,
  onCancel,
  primary = true,
}: {
  readonly submit: SubmitState;
  readonly onSave: () => void;
  readonly onCancel?: () => void;
  readonly primary?: boolean;
}): ReactNode {
  const hint = clearRemediationHint(submit);
  const saving = submit.kind === "submitting";
  return (
    <>
      <span className="flex flex-wrap items-center gap-3">
        <Button
          variant={primary ? "primary" : "secondary"}
          size="md"
          disabled={saving}
          onClick={onSave}
        >
          Save
        </Button>
        {onCancel !== undefined ? (
          <Button size="md" disabled={saving} onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
        <span className="text-xs text-muted-foreground">or press Ctrl or Cmd with Enter</span>
        {submit.kind !== "idle" ? (
          <span aria-live="polite" className={submitStatusClassName(submit)}>
            {submitStatusLabel(submit)}
          </span>
        ) : null}
      </span>
      {hint !== undefined ? <p className="mt-2 text-sm text-muted-foreground">{hint}</p> : null}
    </>
  );
}
