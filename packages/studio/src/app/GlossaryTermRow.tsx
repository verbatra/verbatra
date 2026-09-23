import type { ReactNode, Ref } from "react";
import { useEffect, useId, useRef, useState } from "react";
import {
  ALL_LOCALES,
  buildTermEdit,
  draftFor,
  forbiddenRuleCount,
  hasPerLocaleData,
  isTargetLocale,
  scopeValue,
  type TermDraft,
} from "../client/glossary-editing.js";
import {
  type GlossaryTermView,
  type GlossaryWriteParams,
  MAX_GLOSSARY_NOTE_LENGTH,
  MAX_GLOSSARY_PART_OF_SPEECH_LENGTH,
  MAX_GLOSSARY_TRANSLATION_LENGTH,
} from "../shared/rpc/glossary.js";
import { Badge } from "./Badge.js";
import { Button } from "./Button.js";
import { TextField } from "./Input.js";
import { microLabelClassName } from "./ui.js";

export interface GlossaryWriter {
  readonly pending: string | undefined;
  readonly error: string | undefined;
  readonly write: (edit: GlossaryWriteParams) => Promise<boolean>;
}

const WRAP_TEXT = "min-w-0 [overflow-wrap:anywhere]";

export function CaseSensitiveToggle({
  label,
  checked,
  disabled,
  onChange,
}: {
  readonly label: string;
  readonly checked: boolean;
  readonly disabled: boolean;
  readonly onChange: (next: boolean) => void;
}): ReactNode {
  return (
    <label className="flex items-center gap-2 text-sm text-foreground">
      <input
        type="checkbox"
        className="size-4 accent-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
        aria-label={label}
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      Match case
    </label>
  );
}

function LabeledField({
  label,
  value,
  maxLength,
  disabled,
  autoDirection,
  placeholder,
  inputRef,
  onChange,
}: {
  readonly label: string;
  readonly value: string;
  readonly maxLength: number;
  readonly disabled: boolean;
  readonly autoDirection: boolean;
  readonly placeholder?: string;
  readonly inputRef?: Ref<HTMLInputElement>;
  readonly onChange: (next: string) => void;
}): ReactNode {
  const id = useId();
  return (
    <div className="flex min-w-0 flex-col">
      <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      <TextField
        id={id}
        ref={inputRef}
        dir={autoDirection ? "auto" : undefined}
        value={value}
        placeholder={placeholder}
        maxLength={maxLength}
        disabled={disabled}
        className="max-w-none"
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function ScopedTranslation({
  term,
  scope,
}: {
  readonly term: GlossaryTermView;
  readonly scope: string;
}): ReactNode {
  const value = scopeValue(term, scope);
  if (value.translation === undefined) {
    return (
      <p className="m-0 mt-0.5 text-sm text-muted-foreground">
        {scope === ALL_LOCALES ? "No translation for all locales" : `No translation for ${scope}`}
      </p>
    );
  }
  return (
    <p className="m-0 mt-0.5 text-sm text-foreground">
      <span dir="auto" className={WRAP_TEXT}>
        {value.translation}
      </span>
      {value.inheritedFrom !== undefined ? (
        <span className="ms-2 text-xs text-muted-foreground">
          inherited from {value.inheritedFrom}
        </span>
      ) : null}
    </p>
  );
}

function LocaleOverrides({
  term,
  locales,
}: {
  readonly term: GlossaryTermView;
  readonly locales: readonly string[];
}): ReactNode {
  const overrides = Object.entries(term.targets);
  const rules = forbiddenRuleCount(term);
  if (overrides.length === 0 && rules === 0) {
    return null;
  }
  const stored = overrides.some(([locale]) => !isTargetLocale(locales, locale));
  return (
    <>
      <ul className="m-0 mt-1.5 flex list-none flex-wrap gap-x-3 gap-y-1 p-0">
        {overrides.map(([locale, translation]) => (
          <li key={locale} className="flex min-w-0 items-center gap-1.5 text-sm text-foreground">
            <Badge tone="neutral">{locale}</Badge>
            <span dir="auto" className={WRAP_TEXT}>
              {translation}
            </span>
          </li>
        ))}
      </ul>
      {rules > 0 ? (
        <p className="m-0 mt-1 text-xs text-muted-foreground">
          {rules} never-use {rules === 1 ? "rule" : "rules"}; choose a locale to see them
        </p>
      ) : null}
      {stored ? (
        <p className="m-0 mt-1 text-xs text-muted-foreground">
          Some locales here are not target locales of this project. They are kept as stored and can
          only be changed in the glossary file.
        </p>
      ) : null}
    </>
  );
}

function TermDetails({
  term,
  scope,
  locales,
}: {
  readonly term: GlossaryTermView;
  readonly scope: string;
  readonly locales: readonly string[];
}): ReactNode {
  const forbidden = scopeValue(term, scope).forbidden;
  return (
    <>
      <ScopedTranslation term={term} scope={scope} />
      {scope === ALL_LOCALES ? <LocaleOverrides term={term} locales={locales} /> : null}
      {forbidden.length > 0 ? (
        <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Never use</span>
          {forbidden.map((rendering) => (
            <Badge key={rendering} tone="danger" wrap>
              <span dir="auto">{rendering}</span>
            </Badge>
          ))}
        </div>
      ) : null}
      {term.note !== undefined ? (
        <p className={`m-0 mt-1 text-xs text-muted-foreground ${WRAP_TEXT}`} dir="auto">
          {term.note}
        </p>
      ) : null}
    </>
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
      <legend className={`mb-1.5 p-0 ${microLabelClassName}`}>{title}</legend>
      <div className="grid gap-2 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

function TermEditor({
  term,
  scope,
  draft,
  busy,
  onDraft,
  onCancel,
  onSave,
}: {
  readonly term: GlossaryTermView;
  readonly scope: string;
  readonly draft: TermDraft;
  readonly busy: boolean;
  readonly onDraft: (next: TermDraft) => void;
  readonly onCancel: () => void;
  readonly onSave: () => void;
}): ReactNode {
  const translationRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    translationRef.current?.focus();
  }, []);
  const scopeLabel = scope === ALL_LOCALES ? "all locales" : scope;
  const unchanged = buildTermEdit(term, scope, draft) === undefined;
  return (
    <div className="mt-2 flex flex-col gap-3">
      <EditorGroup title={`For ${scopeLabel}`}>
        <LabeledField
          label={`Translation (${scopeLabel})`}
          value={draft.translation}
          maxLength={MAX_GLOSSARY_TRANSLATION_LENGTH}
          disabled={busy}
          autoDirection
          inputRef={translationRef}
          onChange={(translation) => onDraft({ ...draft, translation })}
        />
        {scope === ALL_LOCALES ? null : (
          <LabeledField
            label={`Never use (${scope})`}
            value={draft.forbidden}
            maxLength={MAX_GLOSSARY_TRANSLATION_LENGTH}
            disabled={busy}
            autoDirection
            placeholder="Comma separated"
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
            disabled={busy}
            autoDirection
            onChange={(note) => onDraft({ ...draft, note })}
          />
          <LabeledField
            label="Part of speech"
            value={draft.partOfSpeech}
            maxLength={MAX_GLOSSARY_PART_OF_SPEECH_LENGTH}
            disabled={busy}
            autoDirection={false}
            onChange={(partOfSpeech) => onDraft({ ...draft, partOfSpeech })}
          />
          <CaseSensitiveToggle
            label={`Match case for ${term.source}`}
            checked={draft.caseSensitive}
            disabled={busy}
            onChange={(caseSensitive) => onDraft({ ...draft, caseSensitive })}
          />
        </EditorGroup>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="primary" onClick={onSave} disabled={busy || unchanged}>
          Save
        </Button>
        <Button onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function RowActions({
  term,
  scope,
  redacted,
  busy,
  editRef,
  onEdit,
  onRemove,
}: {
  readonly term: GlossaryTermView;
  readonly scope: string;
  readonly redacted: boolean;
  readonly busy: boolean;
  readonly editRef: Ref<HTMLButtonElement>;
  readonly onEdit: () => void;
  readonly onRemove: () => void;
}): ReactNode {
  const removable = scope === ALL_LOCALES && !redacted && !hasPerLocaleData(term);
  return (
    <span className="flex items-center gap-1.5">
      {redacted ? null : (
        <Button ref={editRef} onClick={onEdit} disabled={busy} aria-label={`Edit ${term.source}`}>
          Edit
        </Button>
      )}
      {removable ? (
        <Button onClick={onRemove} disabled={busy} aria-label={`Remove ${term.source}`}>
          Remove
        </Button>
      ) : null}
    </span>
  );
}

export function GlossaryTermRow({
  term,
  scope,
  locales,
  redacted,
  editable,
  writer,
}: {
  readonly term: GlossaryTermView;
  readonly scope: string;
  readonly locales: readonly string[];
  readonly redacted: boolean;
  readonly editable: boolean;
  readonly writer: GlossaryWriter;
}): ReactNode {
  const [draft, setDraft] = useState<TermDraft | undefined>(undefined);
  const [returnFocus, setReturnFocus] = useState(false);
  const editRef = useRef<HTMLButtonElement>(null);
  const busy = writer.pending === term.source;

  useEffect(() => {
    if (returnFocus && draft === undefined) {
      editRef.current?.focus();
      setReturnFocus(false);
    }
  }, [returnFocus, draft]);

  function close(): void {
    setDraft(undefined);
    setReturnFocus(true);
  }

  async function save(): Promise<void> {
    const edit = draft === undefined ? undefined : buildTermEdit(term, scope, draft);
    if (edit !== undefined && (await writer.write(edit))) {
      close();
    }
  }

  return (
    <li className="min-w-0 rounded-md border border-border bg-muted/40 px-3 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex min-w-0 flex-wrap items-center gap-2">
          <span
            className={`font-mono text-sm font-semibold text-accent-foreground ${WRAP_TEXT}`}
            dir="auto"
          >
            {term.source}
          </span>
          {term.partOfSpeech !== undefined ? (
            <Badge tone="neutral" wrap>
              {term.partOfSpeech}
            </Badge>
          ) : null}
          {term.caseSensitive ? <Badge tone="neutral">Match case</Badge> : null}
        </span>
        {editable && draft === undefined ? (
          <RowActions
            term={term}
            scope={scope}
            redacted={redacted}
            busy={busy}
            editRef={editRef}
            onEdit={() => setDraft(draftFor(term, scope))}
            onRemove={() => void writer.write({ term: term.source, translation: null })}
          />
        ) : null}
      </div>
      {draft === undefined ? (
        <TermDetails term={term} scope={scope} locales={locales} />
      ) : (
        <TermEditor
          term={term}
          scope={scope}
          draft={draft}
          busy={busy}
          onDraft={setDraft}
          onCancel={close}
          onSave={() => void save()}
        />
      )}
      {redacted ? (
        <p className="m-0 mt-1 text-xs text-muted-foreground">
          A stored value for {term.source} looks like a secret, so it is hidden here and the term
          cannot be edited. Change it in the glossary file itself.
        </p>
      ) : null}
    </li>
  );
}
