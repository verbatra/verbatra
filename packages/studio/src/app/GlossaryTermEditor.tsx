import { Button, Checkbox, microLabelClassName, TextArea, TextField } from "@verbatra/ui";
import type { FormEvent, KeyboardEvent, ReactNode, Ref } from "react";
import { useId } from "react";
import {
  ALL_LOCALES,
  buildTermEdit,
  draftFor,
  exceedsForbiddenCap,
  forbiddenBlocksSave,
  parseRenderings,
  type TermDraft,
} from "../client/glossary-editing.js";
import {
  type GlossaryTermView,
  MAX_FORBIDDEN_RENDERINGS,
  MAX_GLOSSARY_NOTE_LENGTH,
  MAX_GLOSSARY_PART_OF_SPEECH_LENGTH,
  MAX_GLOSSARY_TRANSLATION_LENGTH,
} from "../shared/rpc/glossary.js";
import { cn } from "./lib/cn.js";

export function CaseSensitiveToggle({
  label,
  checked,
  busy,
  onChange,
}: {
  readonly label: string;
  readonly checked: boolean;
  readonly busy: boolean;
  readonly onChange: (next: boolean) => void;
}): ReactNode {
  const id = useId();
  return (
    <label htmlFor={id} className="flex items-center gap-2 text-sm text-foreground">
      <Checkbox
        id={id}
        aria-label={label}
        checked={checked}
        aria-disabled={busy || undefined}
        onChange={(event) => {
          if (!busy) {
            onChange(event.target.checked);
          }
        }}
      />
      Match case
    </label>
  );
}

export function capNoteText(length: number, max: number, noun: string): string | undefined {
  return length < max ? undefined : `${noun} is at its limit of ${max} characters.`;
}

export function joinIds(parts: readonly (string | false | undefined)[]): string | undefined {
  return parts.filter((part): part is string => typeof part === "string").join(" ") || undefined;
}

export function invalidFlag(invalid: boolean): true | undefined {
  return invalid ? true : undefined;
}

export function ProblemNote({
  id,
  children,
}: {
  readonly id: string;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <p id={id} data-cap-note="" className="m-0 mt-1 text-xs text-warning">
      {children}
    </p>
  );
}

function LabeledField({
  label,
  accessibleName,
  value,
  maxLength,
  busy,
  autoDirection,
  placeholder,
  inputRef,
  problem,
  hint,
  multiline = false,
  onChange,
}: {
  readonly label: string;
  readonly accessibleName?: string;
  readonly value: string;
  readonly maxLength?: number;
  readonly busy: boolean;
  readonly autoDirection: boolean;
  readonly placeholder?: string;
  readonly inputRef?: Ref<HTMLInputElement>;
  readonly problem?: string | undefined;
  readonly hint?: string;
  readonly multiline?: boolean;
  readonly onChange: (next: string) => void;
}): ReactNode {
  const id = useId();
  const hintId = `${id}-hint`;
  const problemId = `${id}-problem`;
  const describedBy = joinIds([hint !== undefined && hintId, problem !== undefined && problemId]);
  return (
    <div className="flex min-w-0 flex-col">
      <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      {multiline ? (
        <TextArea
          id={id}
          aria-invalid={invalidFlag(problem !== undefined)}
          aria-describedby={describedBy}
          aria-label={accessibleName}
          aria-busy={busy || undefined}
          readOnly={busy}
          dir={autoDirection ? "auto" : undefined}
          value={value}
          placeholder={placeholder}
          rows={3}
          className="mt-1 h-auto py-1.5"
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <TextField
          id={id}
          ref={inputRef}
          aria-invalid={invalidFlag(problem !== undefined)}
          aria-describedby={describedBy}
          aria-label={accessibleName}
          aria-busy={busy || undefined}
          readOnly={busy}
          dir={autoDirection ? "auto" : undefined}
          value={value}
          placeholder={placeholder}
          maxLength={maxLength}
          className="mt-1"
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      {hint !== undefined ? (
        <p id={hintId} data-field-hint="" className="m-0 mt-1 text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {problem === undefined ? null : <ProblemNote id={problemId}>{problem}</ProblemNote>}
    </div>
  );
}

function EditorGroup({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <fieldset className="m-0 min-w-0 border-0 p-0">
      <legend className={cn("mb-1.5 p-0", microLabelClassName)}>{title}</legend>
      <div className="grid gap-2 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

function forbiddenProblem(text: string): string {
  return exceedsForbiddenCap(text)
    ? `At most ${MAX_FORBIDDEN_RENDERINGS} never-use renderings fit in one term; this has ${parseRenderings(text).length}.`
    : `A never-use rendering can be at most ${MAX_GLOSSARY_TRANSLATION_LENGTH} characters.`;
}

export function GlossaryTermEditor({
  term,
  scope,
  draft,
  busy,
  translationRef,
  onDraft,
  orphaned,
  onCancel,
  onEscape,
  onSave,
}: {
  readonly term: GlossaryTermView;
  readonly scope: string;
  readonly draft: TermDraft;
  readonly busy: boolean;
  readonly translationRef: (element: HTMLInputElement | null) => void;
  readonly onDraft: (next: TermDraft) => void;
  readonly orphaned: boolean;
  readonly onCancel: () => void;
  readonly onEscape: () => void;
  readonly onSave: () => void;
}): ReactNode {
  const scopeLabel = scope === ALL_LOCALES ? "all locales" : scope;
  const unchanged = buildTermEdit(term, scope, draft) === undefined;
  const overCap = forbiddenBlocksSave(draft.forbidden, draftFor(term, scope).forbidden);

  function submit(event: FormEvent): void {
    event.preventDefault();
    if (!busy && !unchanged && !overCap && !orphaned) {
      onSave();
    }
  }

  function cancelOnEscape(event: KeyboardEvent): void {
    if (event.key === "Escape" && !busy && !event.nativeEvent.isComposing) {
      onEscape();
    }
  }

  return (
    <form className="mt-2 flex flex-col gap-3" onSubmit={submit} onKeyDown={cancelOnEscape}>
      <EditorGroup title={`For ${scopeLabel}`}>
        <LabeledField
          label="Translation"
          accessibleName={`Translation (${scopeLabel})`}
          value={draft.translation}
          maxLength={MAX_GLOSSARY_TRANSLATION_LENGTH}
          busy={busy}
          autoDirection
          inputRef={translationRef}
          problem={capNoteText(
            draft.translation.length,
            MAX_GLOSSARY_TRANSLATION_LENGTH,
            "A translation",
          )}
          onChange={(translation) => onDraft({ ...draft, translation })}
        />
        {scope === ALL_LOCALES ? null : (
          <LabeledField
            label="Never use"
            accessibleName={`Never use (${scope})`}
            value={draft.forbidden}
            busy={busy}
            autoDirection
            multiline
            hint="One per line. A comma stays part of the rendering."
            problem={overCap ? forbiddenProblem(draft.forbidden) : undefined}
            onChange={(forbidden) => onDraft({ ...draft, forbidden })}
          />
        )}
      </EditorGroup>
      <div className="border-border border-t pt-3">
        <EditorGroup title="Whole term">
          <LabeledField
            label="Note"
            value={draft.note}
            maxLength={MAX_GLOSSARY_NOTE_LENGTH}
            busy={busy}
            autoDirection
            problem={capNoteText(draft.note.length, MAX_GLOSSARY_NOTE_LENGTH, "A note")}
            onChange={(note) => onDraft({ ...draft, note })}
          />
          <LabeledField
            label="Part of speech"
            value={draft.partOfSpeech}
            maxLength={MAX_GLOSSARY_PART_OF_SPEECH_LENGTH}
            busy={busy}
            autoDirection={false}
            problem={capNoteText(
              draft.partOfSpeech.length,
              MAX_GLOSSARY_PART_OF_SPEECH_LENGTH,
              "A part of speech",
            )}
            onChange={(partOfSpeech) => onDraft({ ...draft, partOfSpeech })}
          />
          <CaseSensitiveToggle
            label={`Match case for ${term.source}`}
            checked={draft.caseSensitive}
            busy={busy}
            onChange={(caseSensitive) => onDraft({ ...draft, caseSensitive })}
          />
        </EditorGroup>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          type="submit"
          variant="primary"
          disabled={unchanged || overCap || orphaned}
          aria-busy={busy || undefined}
          aria-disabled={busy || undefined}
        >
          Save
        </Button>
        <Button aria-disabled={busy || undefined} onClick={busy ? undefined : onCancel}>
          {orphaned ? "Discard draft" : "Cancel"}
        </Button>
      </div>
    </form>
  );
}
