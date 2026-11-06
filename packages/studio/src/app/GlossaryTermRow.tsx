import { Badge, Button } from "@verbatra/ui";
import type { ReactNode } from "react";
import {
  ALL_LOCALES,
  buildTermEdit,
  editEmptiesTerm,
  forbiddenRuleCount,
  hasPerLocaleData,
  isRetryableWriteError,
  isTargetLocale,
  scopeValue,
} from "../client/glossary-editing.js";
import type { GlossaryTermView } from "../shared/rpc/glossary.js";
import { ErrorMessage } from "./ErrorMessage.js";
import { GlossaryTermEditor } from "./GlossaryTermEditor.js";
import { editorFieldKey, termKey, useGlossaryBench } from "./glossary-bench.js";
import { cn } from "./lib/cn.js";
import { TranslationValue, valueDirection } from "./TranslationValue.js";
import type { WriteFailure } from "./use-glossary-writer.js";

const WRAP_TEXT = "min-w-0 wrap-anywhere";

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
  const own = scope !== ALL_LOCALES && value.inheritedFrom !== "all locales";
  return (
    <p
      className="m-0 mt-0.5 text-sm text-foreground"
      dir={
        scope === ALL_LOCALES ? "auto" : valueDirection(own ? scope : undefined, value.translation)
      }
    >
      {scope === ALL_LOCALES ? (
        <span dir="auto" className={WRAP_TEXT}>
          {value.translation}
        </span>
      ) : (
        <TranslationValue
          value={value.translation}
          locale={own ? scope : undefined}
          className={WRAP_TEXT}
        />
      )}
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
            <Badge tone="neutral" verbatim>
              {locale}
            </Badge>
            <TranslationValue value={translation} locale={locale} className={WRAP_TEXT} />
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
            <Badge key={rendering} tone="danger" wrap verbatim>
              <TranslationValue value={rendering} locale={scope} />
            </Badge>
          ))}
        </div>
      ) : null}
      {term.note !== undefined ? (
        <p className={cn("m-0 mt-1 text-xs text-muted-foreground", WRAP_TEXT)} dir="auto">
          {term.note}
        </p>
      ) : null}
    </>
  );
}

function RowActions({
  term,
  busy,
  removable,
  onEdit,
  onRemove,
}: {
  readonly term: GlossaryTermView;
  readonly busy: boolean;
  readonly removable: boolean;
  readonly onEdit: () => void;
  readonly onRemove: () => void;
}): ReactNode {
  const { focus } = useGlossaryBench();
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      <Button
        ref={focus.register(termKey(term.source))}
        size="xs"
        aria-disabled={busy || undefined}
        onClick={busy ? undefined : onEdit}
        aria-label={`Edit ${term.source}`}
      >
        Edit
      </Button>
      {removable ? (
        <Button
          size="xs"
          aria-disabled={busy || undefined}
          onClick={busy ? undefined : onRemove}
          aria-label={`Remove ${term.source}`}
        >
          Remove
        </Button>
      ) : null}
    </span>
  );
}

function RowNotes({
  term,
  redacted,
  showRemoveReason,
  failure,
  busy,
  onRetry,
}: {
  readonly term: GlossaryTermView;
  readonly redacted: boolean;
  readonly showRemoveReason: boolean;
  readonly failure: WriteFailure | undefined;
  readonly busy: boolean;
  readonly onRetry: (failed: WriteFailure) => void;
}): ReactNode {
  return (
    <>
      {showRemoveReason ? (
        <p data-remove-reason="" className="m-0 mt-1 text-xs text-muted-foreground">
          This term cannot be removed while a locale holds its own translation or rules. Clear those
          first, and it goes with the last one.
        </p>
      ) : null}
      {failure !== undefined ? (
        <div className="mt-2">
          <ErrorMessage
            error={failure.error}
            retrying={busy}
            {...(isRetryableWriteError(failure.error) ? { onRetry: () => onRetry(failure) } : {})}
          />
        </div>
      ) : null}
      {redacted ? (
        <p className="m-0 mt-1 text-xs text-muted-foreground">
          A stored value for {term.source} looks like a secret, so it is hidden here and the term
          cannot be edited. Change it in the glossary file itself.
        </p>
      ) : null}
    </>
  );
}

export function GlossaryTermRow({
  term,
  redacted,
  orphaned,
}: {
  readonly term: GlossaryTermView;
  readonly redacted: boolean;
  readonly orphaned: boolean;
}): ReactNode {
  const bench = useGlossaryBench();
  const { scope, locales, editable, writer, focus } = bench;
  const key = termKey(term.source);
  const draft = bench.editors.get(term.source)?.draft;
  const busy = writer.busy(key);
  const failure = writer.failure(key);
  const perLocale = hasPerLocaleData(term);
  const removable = scope === ALL_LOCALES && !perLocale;
  const actionable = editable && !redacted && !orphaned;

  async function save(): Promise<void> {
    const edit = draft === undefined ? undefined : buildTermEdit(term, scope, draft);
    if (edit === undefined) {
      return;
    }
    if (editEmptiesTerm(term, edit)) {
      bench.askRemoval({ kind: "term", term, cause: "clear", edit });
    } else {
      await writer.write(key, edit, () => bench.afterTermWrite(term, edit));
    }
  }

  async function retry(failed: WriteFailure): Promise<void> {
    await writer.retry(key, () => bench.afterTermWrite(term, failed.edit));
  }

  return (
    <li
      data-glossary-row=""
      ref={redacted ? focus.register(key) : undefined}
      tabIndex={redacted ? -1 : undefined}
      className="min-w-0 rounded-(--radius-lg) border border-border bg-muted/40 px-3 py-2.5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex min-w-0 flex-1 basis-0 flex-wrap items-center gap-2">
          <span
            className={cn("font-mono text-sm font-semibold text-accent-foreground", WRAP_TEXT)}
            dir="auto"
          >
            {term.source}
          </span>
          {term.partOfSpeech !== undefined ? (
            <Badge tone="neutral" wrap verbatim>
              {term.partOfSpeech}
            </Badge>
          ) : null}
          {term.caseSensitive ? <Badge tone="neutral">Match case</Badge> : null}
        </span>
        {actionable && draft === undefined ? (
          <RowActions
            term={term}
            busy={busy}
            removable={removable}
            onEdit={() => bench.openEditor(term.source)}
            onRemove={() =>
              bench.askRemoval({
                kind: "term",
                term,
                cause: "remove",
                edit: { term: term.source, translation: null },
              })
            }
          />
        ) : null}
      </div>
      {orphaned ? (
        <p data-orphan-notice="" className="m-0 mt-1 text-sm text-warning">
          This term no longer exists in the glossary. Your draft stays until you discard it.
        </p>
      ) : null}
      {draft === undefined ? (
        <TermDetails term={term} scope={scope} locales={locales} />
      ) : (
        <GlossaryTermEditor
          term={term}
          scope={scope}
          draft={draft}
          busy={busy}
          translationRef={focus.register(editorFieldKey(term.source))}
          orphaned={orphaned}
          onDraft={(next) => bench.setDraft(term, next)}
          onCancel={() => bench.closeEditor(term.source)}
          onEscape={() => bench.escapeEditor(term.source)}
          onSave={() => void save()}
        />
      )}
      <RowNotes
        term={term}
        redacted={redacted}
        showRemoveReason={actionable && draft === undefined && scope === ALL_LOCALES && perLocale}
        failure={failure}
        busy={busy}
        onRetry={(failed) => void retry(failed)}
      />
    </li>
  );
}
