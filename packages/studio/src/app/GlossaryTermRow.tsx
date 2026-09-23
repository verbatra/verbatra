import type { ReactNode } from "react";
import { useState } from "react";
import {
  ALL_LOCALES,
  buildTermEdit,
  draftFor,
  hasPerLocaleData,
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
import { MonoValue } from "./ui.js";

export interface GlossaryWriter {
  readonly pending: string | undefined;
  readonly error: string | undefined;
  readonly write: (edit: GlossaryWriteParams) => Promise<boolean>;
}

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
        className="size-4 accent-primary"
        aria-label={label}
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      Match case
    </label>
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
      <span dir="auto">{value.translation}</span>
      {scope !== ALL_LOCALES && value.inherited ? (
        <span className="ms-2 text-xs text-muted-foreground">inherited</span>
      ) : null}
    </p>
  );
}

function TermDetails({
  term,
  scope,
}: {
  readonly term: GlossaryTermView;
  readonly scope: string;
}): ReactNode {
  const overrides = Object.entries(term.targets);
  const forbidden = scopeValue(term, scope).forbidden;
  return (
    <>
      <ScopedTranslation term={term} scope={scope} />
      {scope === ALL_LOCALES && overrides.length > 0 ? (
        <p className="m-0 mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {overrides.map(([locale, translation]) => (
            <span key={locale}>
              <MonoValue>{locale}</MonoValue> <span dir="auto">{translation}</span>
            </span>
          ))}
        </p>
      ) : null}
      {forbidden.length > 0 ? (
        <p className="m-0 mt-1.5 flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Never use</span>
          {forbidden.map((rendering) => (
            <Badge key={rendering} tone="danger">
              <span dir="auto">{rendering}</span>
            </Badge>
          ))}
        </p>
      ) : null}
      {term.note !== undefined ? (
        <p className="m-0 mt-1 text-xs text-muted-foreground" dir="auto">
          {term.note}
        </p>
      ) : null}
    </>
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
  const tooLong =
    draft.translation.length > MAX_GLOSSARY_TRANSLATION_LENGTH ||
    draft.note.length > MAX_GLOSSARY_NOTE_LENGTH ||
    draft.partOfSpeech.length > MAX_GLOSSARY_PART_OF_SPEECH_LENGTH;
  const unchanged = buildTermEdit(term, scope, draft) === undefined;
  const scopeLabel = scope === ALL_LOCALES ? "all locales" : scope;
  return (
    <div className="mt-2 grid gap-2 sm:grid-cols-2">
      <TextField
        aria-label={`Translation of ${term.source} for ${scopeLabel}`}
        placeholder={`Translation for ${scopeLabel}`}
        dir="auto"
        value={draft.translation}
        disabled={busy}
        onChange={(event) => onDraft({ ...draft, translation: event.target.value })}
      />
      {scope === ALL_LOCALES ? null : (
        <TextField
          aria-label={`Forbidden renderings of ${term.source} for ${scope}`}
          placeholder="Never use, comma separated"
          dir="auto"
          value={draft.forbidden}
          disabled={busy}
          onChange={(event) => onDraft({ ...draft, forbidden: event.target.value })}
        />
      )}
      <TextField
        aria-label={`Note for ${term.source}`}
        placeholder="Note for translators"
        dir="auto"
        value={draft.note}
        disabled={busy}
        onChange={(event) => onDraft({ ...draft, note: event.target.value })}
      />
      <TextField
        aria-label={`Part of speech of ${term.source}`}
        placeholder="Part of speech"
        value={draft.partOfSpeech}
        disabled={busy}
        onChange={(event) => onDraft({ ...draft, partOfSpeech: event.target.value })}
      />
      <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
        <CaseSensitiveToggle
          label={`Match case for ${term.source}`}
          checked={draft.caseSensitive}
          disabled={busy}
          onChange={(caseSensitive) => onDraft({ ...draft, caseSensitive })}
        />
        <span className="ms-auto flex gap-2">
          <Button variant="primary" onClick={onSave} disabled={busy || unchanged || tooLong}>
            Save
          </Button>
          <Button onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        </span>
      </div>
    </div>
  );
}

function RowActions({
  term,
  scope,
  redacted,
  busy,
  onEdit,
  onRemove,
}: {
  readonly term: GlossaryTermView;
  readonly scope: string;
  readonly redacted: boolean;
  readonly busy: boolean;
  readonly onEdit: () => void;
  readonly onRemove: () => void;
}): ReactNode {
  const removable = scope === ALL_LOCALES && !redacted && !hasPerLocaleData(term);
  return (
    <span className="flex items-center gap-1.5">
      {redacted ? null : (
        <Button onClick={onEdit} disabled={busy} aria-label={`Edit ${term.source}`}>
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
  redacted,
  editable,
  writer,
}: {
  readonly term: GlossaryTermView;
  readonly scope: string;
  readonly redacted: boolean;
  readonly editable: boolean;
  readonly writer: GlossaryWriter;
}): ReactNode {
  const [draft, setDraft] = useState<TermDraft | undefined>(undefined);
  const busy = writer.pending === term.source;

  async function save(): Promise<void> {
    const edit = draft === undefined ? undefined : buildTermEdit(term, scope, draft);
    if (edit !== undefined && (await writer.write(edit))) {
      setDraft(undefined);
    }
  }

  return (
    <li className="rounded-md border border-border bg-muted/40 px-3 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm font-semibold text-accent-foreground">
            {term.source}
          </span>
          {term.partOfSpeech !== undefined ? (
            <Badge tone="neutral">{term.partOfSpeech}</Badge>
          ) : null}
          {term.caseSensitive ? <Badge tone="neutral">Match case</Badge> : null}
        </span>
        {editable && draft === undefined ? (
          <RowActions
            term={term}
            scope={scope}
            redacted={redacted}
            busy={busy}
            onEdit={() => setDraft(draftFor(term, scope))}
            onRemove={() => void writer.write({ term: term.source, translation: null })}
          />
        ) : null}
      </div>
      {draft === undefined ? (
        <TermDetails term={term} scope={scope} />
      ) : (
        <TermEditor
          term={term}
          scope={scope}
          draft={draft}
          busy={busy}
          onDraft={setDraft}
          onCancel={() => setDraft(undefined)}
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
