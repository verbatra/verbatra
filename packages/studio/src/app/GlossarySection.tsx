import type { ReactNode } from "react";
import { useId, useState } from "react";
import {
  ALL_LOCALES,
  deriveGlossaryWriteOutcome,
  glossaryReadOnlyReason,
} from "../client/glossary-editing.js";
import {
  type GlossaryGetResult,
  type GlossaryIndicator,
  type GlossaryWriteParams,
  type GlossaryWriteResult,
  MAX_GLOSSARY_TERM_LENGTH,
  MAX_GLOSSARY_TRANSLATION_LENGTH,
} from "../shared/rpc/glossary.js";
import { rpcClient } from "./api.js";
import { Badge } from "./Badge.js";
import { Button } from "./Button.js";
import { GlossaryDoNotTranslate, glossarySubheadingClassName } from "./GlossaryDoNotTranslate.js";
import { GlossaryTermRow, type GlossaryWriter } from "./GlossaryTermRow.js";
import { TextField } from "./Input.js";
import { Select } from "./Select.js";
import { EmptyState, SectionCard } from "./ui.js";

function useGlossaryWriter(onChange: (next: GlossaryWriteResult) => void): GlossaryWriter {
  const [pending, setPending] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);

  async function write(edit: GlossaryWriteParams): Promise<boolean> {
    setPending(edit.term);
    setError(undefined);
    const outcome = deriveGlossaryWriteOutcome(await rpcClient.call("glossary.write", edit));
    setPending(undefined);
    if (outcome.kind === "error") {
      setError(outcome.message);
      return false;
    }
    onChange(outcome.glossary);
    return true;
  }

  return { pending, error, write };
}

export function glossaryIndicatorLabel(indicator: GlossaryIndicator): string {
  if (indicator.source === "file") {
    return `file (${indicator.path})`;
  }
  return indicator.source;
}

function ScopeSelect({
  locales,
  scope,
  onScope,
}: {
  readonly locales: readonly string[];
  readonly scope: string;
  readonly onScope: (next: string) => void;
}): ReactNode {
  const id = useId();
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
      <label htmlFor={id}>Show translations for</label>
      <Select id={id} value={scope} onChange={(event) => onScope(event.target.value)}>
        <option value={ALL_LOCALES}>All locales</option>
        {locales.map((locale) => (
          <option key={locale} value={locale}>
            {locale}
          </option>
        ))}
      </Select>
    </div>
  );
}

function GlossaryAddForm({
  scope,
  writer,
}: {
  readonly scope: string;
  readonly writer: GlossaryWriter;
}): ReactNode {
  const [term, setTerm] = useState("");
  const [translation, setTranslation] = useState("");
  const busy = writer.pending !== undefined;
  const ready =
    term.trim().length > 0 &&
    term.length <= MAX_GLOSSARY_TERM_LENGTH &&
    translation.trim().length > 0 &&
    translation.length <= MAX_GLOSSARY_TRANSLATION_LENGTH;

  async function add(): Promise<void> {
    const edit: GlossaryWriteParams = {
      term: term.trim(),
      translation,
      ...(scope === ALL_LOCALES ? {} : { locale: scope }),
    };
    if (await writer.write(edit)) {
      setTerm("");
      setTranslation("");
    }
  }

  return (
    <div className="mt-4 border-border border-t pt-4">
      <h3 className={glossarySubheadingClassName}>
        {scope === ALL_LOCALES ? "Add a term" : `Add a term for ${scope}`}
      </h3>
      <div className="grid items-end gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <TextField
          aria-label="New glossary term"
          placeholder="Source term"
          className="max-w-none"
          value={term}
          disabled={busy}
          onChange={(event) => setTerm(event.target.value)}
        />
        <TextField
          aria-label="New glossary translation"
          placeholder={
            scope === ALL_LOCALES ? "Translation for all locales" : `Translation for ${scope}`
          }
          dir="auto"
          className="max-w-none"
          value={translation}
          disabled={busy}
          onChange={(event) => setTranslation(event.target.value)}
        />
        <Button variant="primary" onClick={() => void add()} disabled={busy || !ready}>
          Add term
        </Button>
      </div>
    </div>
  );
}

export function GlossarySection({
  glossary,
  onChange,
}: {
  readonly glossary: GlossaryGetResult;
  readonly onChange: (next: GlossaryWriteResult) => void;
}): ReactNode {
  const writer = useGlossaryWriter(onChange);
  const [scope, setScope] = useState<string>(ALL_LOCALES);
  const readOnlyReason = glossaryReadOnlyReason(glossary.indicator);
  const editable = readOnlyReason === undefined;
  const count = glossary.terms.length;

  return (
    <SectionCard
      title="Glossary"
      intro={`Source: ${glossaryIndicatorLabel(glossary.indicator)}`}
      className="mb-0"
      meta={
        count > 0 ? (
          <Badge tone="neutral">
            {count} {count === 1 ? "term" : "terms"}
          </Badge>
        ) : undefined
      }
    >
      {readOnlyReason !== undefined ? (
        <p className="m-0 mb-3 text-sm text-muted-foreground">{readOnlyReason}</p>
      ) : null}
      {glossary.locales.length > 0 && (count > 0 || editable) ? (
        <ScopeSelect locales={glossary.locales} scope={scope} onScope={setScope} />
      ) : null}
      {count === 0 ? (
        <EmptyState title="No glossary terms">
          Add a glossary to keep brand terms and fixed vocabulary consistent across locales.
        </EmptyState>
      ) : (
        <ul className="m-0 flex min-w-0 list-none flex-col gap-2 p-0">
          {glossary.terms.map((term) => (
            <GlossaryTermRow
              key={`${scope}:${term.source}`}
              term={term}
              scope={scope}
              locales={glossary.locales}
              redacted={glossary.redactedTerms.includes(term.source)}
              editable={editable}
              writer={writer}
            />
          ))}
        </ul>
      )}
      {editable ? <GlossaryAddForm scope={scope} writer={writer} /> : null}
      <GlossaryDoNotTranslate
        entries={glossary.doNotTranslate}
        editable={editable}
        writer={writer}
      />
      {writer.error !== undefined ? (
        <p className="m-0 mt-3 text-danger text-sm" role="alert">
          {writer.error}
        </p>
      ) : null}
    </SectionCard>
  );
}
