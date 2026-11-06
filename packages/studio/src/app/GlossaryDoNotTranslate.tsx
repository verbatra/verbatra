import { Badge, Button, TextField } from "@verbatra/ui";
import type { FormEvent, ReactNode } from "react";
import { useRef } from "react";
import { EMPTY_KEEP_DRAFT } from "../client/glossary-drafts.js";
import { isRetryableWriteError, keptTermEntry } from "../client/glossary-editing.js";
import {
  type GlossaryDoNotTranslateView,
  MAX_GLOSSARY_TERM_LENGTH,
} from "../shared/rpc/glossary.js";
import { ErrorMessage } from "./ErrorMessage.js";
import { CaseSensitiveToggle } from "./GlossaryTermEditor.js";
import { DNT_HEADING, KEEP_KEY, keptKey, useGlossaryBench } from "./glossary-bench.js";
import { cn } from "./lib/cn.js";

export const glossarySubheadingClassName = "m-0 mb-2 text-sm font-medium text-foreground";

function KeptTerm({
  entry,
  next,
}: {
  readonly entry: GlossaryDoNotTranslateView;
  readonly next: GlossaryDoNotTranslateView | undefined;
}): ReactNode {
  const bench = useGlossaryBench();
  const key = keptKey(entry.term);
  const busy = bench.writer.busy(key);
  const failure = bench.writer.failure(key);
  return (
    <li className="flex max-w-full min-w-0 flex-wrap items-center gap-2 rounded-(--radius-lg) border border-border bg-muted/40 px-2.5 py-1.5">
      <span
        className="min-w-0 max-w-full wrap-anywhere font-mono text-sm text-accent-foreground"
        dir="auto"
      >
        {entry.term}
      </span>
      {entry.caseSensitive ? <Badge tone="neutral">Match case</Badge> : null}
      {bench.editable ? (
        <Button
          ref={bench.focus.register(keptKey(entry.term))}
          size="xs"
          aria-disabled={busy || undefined}
          onClick={
            busy
              ? undefined
              : () =>
                  bench.askRemoval({
                    kind: "kept",
                    entry,
                    edit: { term: entry.term, doNotTranslate: false },
                  })
          }
          aria-label={`Remove ${entry.term} from do not translate`}
        >
          Remove
        </Button>
      ) : null}
      {failure !== undefined ? (
        <div className="w-full">
          <ErrorMessage
            error={failure.error}
            prefix={`Could not stop keeping ${entry.term} untranslated.`}
            retrying={busy}
            {...(isRetryableWriteError(failure.error)
              ? {
                  onRetry: () =>
                    void bench.writer.retry(key, {
                      onDone: () =>
                        bench.focus.request([
                          ...(next === undefined ? [] : [keptKey(next.term)]),
                          KEEP_KEY,
                        ]),
                    }),
                }
              : {})}
          />
        </div>
      ) : null}
    </li>
  );
}

function KeepForm({
  entries,
}: {
  readonly entries: readonly GlossaryDoNotTranslateView[];
}): ReactNode {
  const bench = useGlossaryBench();
  const { keep, writer, focus } = bench;
  const latest = useRef(keep);
  latest.current = keep;
  const busy = writer.busy(KEEP_KEY);
  const failure = writer.failure(KEEP_KEY);
  const trimmed = keep.term.trim();
  const existing = keptTermEntry(entries, trimmed);
  const tooLong = trimmed.length > MAX_GLOSSARY_TERM_LENGTH;
  const ready = trimmed.length > 0 && !tooLong && existing === undefined;

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!ready || busy) {
      return;
    }
    const edit = keep.caseSensitive
      ? { term: trimmed, doNotTranslate: true }
      : { term: trimmed, doNotTranslate: true, caseSensitive: false };
    await writer.write(KEEP_KEY, edit, { onDone: () => settle(trimmed) });
  }

  function settle(sent: string): void {
    if (latest.current.term.trim() === sent) {
      bench.setKeep(EMPTY_KEEP_DRAFT);
      focus.request([KEEP_KEY]);
    }
  }

  async function retry(sent: string): Promise<void> {
    await writer.retry(KEEP_KEY, { onDone: () => settle(sent) });
  }

  return (
    <>
      <form
        className="mt-2 grid items-end gap-2 sm:grid-cols-[1fr_auto_auto]"
        onSubmit={(event) => void submit(event)}
      >
        <div className="min-w-0">
          <TextField
            ref={focus.register(KEEP_KEY)}
            aria-label="New do-not-translate term"
            placeholder="Brand or product name"
            dir="auto"
            readOnly={busy}
            aria-busy={busy || undefined}
            value={keep.term}
            onChange={(event) => bench.setKeep({ ...keep, term: event.target.value })}
          />
          {tooLong ? (
            <p data-cap-note="" className="m-0 mt-1 text-xs text-warning">
              A term can be at most {MAX_GLOSSARY_TERM_LENGTH} characters; this one has{" "}
              {trimmed.length}.
            </p>
          ) : null}
          {existing !== undefined ? (
            <p data-exists-note="" className="m-0 mt-1 text-xs text-muted-foreground wrap-anywhere">
              {existing.term} is already kept untranslated
              {existing.caseSensitive ? " with Match case" : " without Match case"}. Remove it first
              to change that.
            </p>
          ) : null}
        </div>
        <CaseSensitiveToggle
          label="Match case for the new do-not-translate term"
          checked={keep.caseSensitive}
          busy={busy}
          onChange={(caseSensitive) => bench.setKeep({ ...keep, caseSensitive })}
        />
        <Button
          type="submit"
          variant="primary"
          disabled={!ready}
          aria-busy={busy || undefined}
          aria-disabled={busy || undefined}
        >
          Keep untranslated
        </Button>
      </form>
      {failure !== undefined ? (
        <div className="mt-2">
          <ErrorMessage
            error={failure.error}
            retrying={busy}
            {...(isRetryableWriteError(failure.error)
              ? { onRetry: () => void retry(failure.edit.term) }
              : {})}
          />
        </div>
      ) : null}
    </>
  );
}

export function GlossaryDoNotTranslate({
  entries,
}: {
  readonly entries: readonly GlossaryDoNotTranslateView[];
}): ReactNode {
  const { editable, focus } = useGlossaryBench();
  if (entries.length === 0 && !editable) {
    return null;
  }
  return (
    <div className="mt-4 border-border border-t pt-4">
      <h3
        ref={focus.register(DNT_HEADING)}
        tabIndex={-1}
        className={cn(glossarySubheadingClassName, "outline-none focus-visible:underline")}
      >
        Do not translate
      </h3>
      {entries.length === 0 ? (
        <p className="m-0 text-sm text-muted-foreground">
          No term is kept untranslated yet. Add brand and product names here so every locale keeps
          them as written.
        </p>
      ) : (
        <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
          {entries.map((entry, index) => (
            <KeptTerm key={entry.term} entry={entry} next={entries[index + 1]} />
          ))}
        </ul>
      )}
      {editable ? <KeepForm entries={entries} /> : null}
    </div>
  );
}
