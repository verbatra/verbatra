import { Button, TextField } from "@verbatra/ui";
import type { FormEvent, ReactNode } from "react";
import { useRef, useState } from "react";
import { type AddDraft, EMPTY_ADD_DRAFT } from "../client/glossary-drafts.js";
import { ALL_LOCALES, existingTermFor, isRetryableWriteError } from "../client/glossary-editing.js";
import {
  type GlossaryTermView,
  type GlossaryWriteParams,
  MAX_GLOSSARY_TERM_LENGTH,
  MAX_GLOSSARY_TRANSLATION_LENGTH,
} from "../shared/rpc/glossary.js";
import { ErrorMessage } from "./ErrorMessage.js";
import { glossarySubheadingClassName } from "./GlossaryDoNotTranslate.js";
import { CapNote } from "./GlossaryTermEditor.js";
import { ADD_FIELD, ADD_KEY, useGlossaryBench } from "./glossary-bench.js";
import { focusIsFree } from "./use-focus-registry.js";

function ExistsNote({
  term,
  redacted,
  listed,
  onEdit,
}: {
  readonly term: GlossaryTermView;
  readonly redacted: boolean;
  readonly listed: boolean;
  readonly onEdit: () => void;
}): ReactNode {
  return (
    <p
      data-exists-note=""
      className="m-0 mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground"
    >
      <span className="min-w-0 wrap-anywhere">
        {term.source} is already in the glossary
        {redacted ? ", and it cannot be edited here." : "."}
      </span>
      {redacted || !listed ? null : (
        <Button size="xs" aria-label={`Edit ${term.source}`} onClick={onEdit}>
          Edit
        </Button>
      )}
    </p>
  );
}

interface Fresh {
  readonly term: GlossaryTermView;
  readonly scope: string;
  readonly typed: string;
}

function freshMatch(
  fresh: Fresh | undefined,
  scope: string,
  typed: string,
): GlossaryTermView | undefined {
  return fresh?.scope === scope && fresh.typed === typed ? fresh.term : undefined;
}

export function GlossaryAddForm({
  terms,
  redactedTerms,
}: {
  readonly terms: readonly GlossaryTermView[];
  readonly redactedTerms: readonly string[];
}): ReactNode {
  const bench = useGlossaryBench();
  const { scope, add, writer, focus } = bench;
  const latest = useRef(add);
  latest.current = add;
  const busy = writer.busy(ADD_KEY);
  const failure = writer.failure(ADD_KEY);
  const [fresh, setFresh] = useState<Fresh | undefined>(undefined);
  const trimmedTerm = add.term.trim();
  const trimmedTranslation = add.translation.trim();
  const existing =
    existingTermFor(terms, redactedTerms, trimmedTerm, scope) ??
    freshMatch(fresh, scope, trimmedTerm);
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const waiting = busy || bench.addChecking;
  const box = useRef<HTMLDivElement>(null);
  const tooLong = trimmedTerm.length > MAX_GLOSSARY_TERM_LENGTH;
  const ready =
    trimmedTerm.length > 0 && !tooLong && trimmedTranslation.length > 0 && existing === undefined;

  function settle(sent: GlossaryWriteParams): void {
    const now = latest.current;
    const unchanged = sent.term === now.term.trim() && sent.translation === now.translation.trim();
    if (unchanged) {
      bench.setAdd(EMPTY_ADD_DRAFT);
      if (focusIsFree(box.current)) {
        focus.request([ADD_FIELD]);
      }
    }
  }

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!ready || waiting) {
      return;
    }
    const edit: GlossaryWriteParams = {
      term: trimmedTerm,
      translation: trimmedTranslation,
      ...(scope === ALL_LOCALES ? {} : { locale: scope }),
    };
    bench.setAddChecking(true);
    let pending: Promise<boolean> | undefined;
    try {
      const read = await bench.readFresh();
      const now = latest.current;
      const unchanged =
        now.term.trim() === edit.term &&
        now.translation.trim() === edit.translation &&
        scopeRef.current === scope;
      const taken =
        read === undefined
          ? undefined
          : existingTermFor(read.terms, read.redactedTerms, trimmedTerm, scope);
      if (taken !== undefined) {
        setFresh({ term: taken, scope, typed: trimmedTerm });
      } else if (unchanged) {
        pending = writer.write(ADD_KEY, edit, { onDone: () => settle(edit) });
      }
    } finally {
      bench.setAddChecking(false);
    }
    await pending;
  }

  function change(next: AddDraft): void {
    setFresh(undefined);
    bench.setAdd(next);
  }

  async function retry(sent: GlossaryWriteParams): Promise<void> {
    await writer.retry(ADD_KEY, { onDone: () => settle(sent) });
  }

  return (
    <div ref={box} className="mb-4 border-border border-b pb-4">
      <h3 className={glossarySubheadingClassName}>
        {scope === ALL_LOCALES ? "Add a term" : `Add a term for ${scope}`}
      </h3>
      <form
        className="grid items-start gap-2 sm:grid-cols-[1fr_1fr_auto]"
        onSubmit={(event) => void submit(event)}
      >
        <div className="min-w-0">
          <TextField
            ref={focus.register(ADD_FIELD)}
            aria-label="New glossary term"
            placeholder="Source term"
            dir="auto"
            readOnly={waiting}
            aria-busy={waiting || undefined}
            value={add.term}
            onChange={(event) => change({ ...add, term: event.target.value })}
          />
          {tooLong ? (
            <p data-cap-note="" className="m-0 mt-1 text-xs text-warning">
              A term can be at most {MAX_GLOSSARY_TERM_LENGTH} characters; this one has{" "}
              {trimmedTerm.length}.
            </p>
          ) : null}
        </div>
        <div className="min-w-0">
          <TextField
            aria-label="New glossary translation"
            placeholder={
              scope === ALL_LOCALES ? "Translation for all locales" : `Translation for ${scope}`
            }
            dir="auto"
            readOnly={waiting}
            aria-busy={waiting || undefined}
            maxLength={MAX_GLOSSARY_TRANSLATION_LENGTH}
            value={add.translation}
            onChange={(event) => change({ ...add, translation: event.target.value })}
          />
          <CapNote
            length={add.translation.length}
            max={MAX_GLOSSARY_TRANSLATION_LENGTH}
            noun="A translation"
          />
        </div>
        <Button
          type="submit"
          variant="primary"
          disabled={!ready}
          aria-busy={waiting || undefined}
          aria-disabled={waiting || undefined}
        >
          Add term
        </Button>
      </form>
      {existing !== undefined ? (
        <ExistsNote
          term={existing}
          redacted={redactedTerms.includes(existing.source)}
          listed={terms.some((term) => term.source === existing.source)}
          onEdit={() => bench.openEditor(existing.source)}
        />
      ) : null}
      {failure !== undefined ? (
        <div className="mt-2">
          <ErrorMessage
            error={failure.error}
            retrying={busy}
            {...(isRetryableWriteError(failure.error)
              ? { onRetry: () => void retry(failure.edit) }
              : {})}
          />
        </div>
      ) : null}
    </div>
  );
}
