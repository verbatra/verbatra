import type { ReactNode } from "react";
import { useState } from "react";
import {
  type GlossaryDoNotTranslateView,
  MAX_GLOSSARY_TERM_LENGTH,
} from "../shared/rpc/glossary.js";
import { Button } from "./Button.js";
import { CaseSensitiveToggle, type GlossaryWriter } from "./GlossaryTermRow.js";
import { TextField } from "./Input.js";
import { microLabelClassName } from "./ui.js";

function KeptTerm({
  entry,
  editable,
  writer,
}: {
  readonly entry: GlossaryDoNotTranslateView;
  readonly editable: boolean;
  readonly writer: GlossaryWriter;
}): ReactNode {
  return (
    <li className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-2.5 py-1.5">
      <span className="font-mono text-sm text-accent-foreground" dir="auto">
        {entry.term}
      </span>
      <span className="text-xs text-muted-foreground">
        {entry.caseSensitive ? "match case" : "any case"}
      </span>
      {editable ? (
        <Button
          variant="ghost"
          onClick={() => void writer.write({ term: entry.term, doNotTranslate: false })}
          disabled={writer.pending === entry.term}
          aria-label={`Remove ${entry.term} from do not translate`}
        >
          Remove
        </Button>
      ) : null}
    </li>
  );
}

function KeepForm({ writer }: { readonly writer: GlossaryWriter }): ReactNode {
  const [term, setTerm] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(true);
  const busy = writer.pending !== undefined;
  const ready = term.trim().length > 0 && term.length <= MAX_GLOSSARY_TERM_LENGTH;

  async function keep(): Promise<void> {
    const edit = caseSensitive
      ? { term: term.trim(), doNotTranslate: true }
      : { term: term.trim(), doNotTranslate: true, caseSensitive: false };
    if (await writer.write(edit)) {
      setTerm("");
    }
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <TextField
        aria-label="New do-not-translate term"
        placeholder="Brand or product name"
        dir="auto"
        value={term}
        disabled={busy}
        onChange={(event) => setTerm(event.target.value)}
      />
      <CaseSensitiveToggle
        label="Match case for the new do-not-translate term"
        checked={caseSensitive}
        disabled={busy}
        onChange={setCaseSensitive}
      />
      <Button onClick={() => void keep()} disabled={busy || !ready}>
        Keep untranslated
      </Button>
    </div>
  );
}

export function GlossaryDoNotTranslate({
  entries,
  editable,
  writer,
}: {
  readonly entries: readonly GlossaryDoNotTranslateView[];
  readonly editable: boolean;
  readonly writer: GlossaryWriter;
}): ReactNode {
  if (entries.length === 0 && !editable) {
    return null;
  }
  return (
    <div className="mt-4 border-border border-t pt-4">
      <p className={microLabelClassName}>Do not translate</p>
      {entries.length === 0 ? (
        <p className="m-0 mt-1 text-sm text-muted-foreground">
          No term is kept untranslated yet. Add brand and product names here so every locale keeps
          them as written.
        </p>
      ) : (
        <ul className="m-0 mt-2 flex list-none flex-wrap gap-2 p-0">
          {entries.map((entry) => (
            <KeptTerm key={entry.term} entry={entry} editable={editable} writer={writer} />
          ))}
        </ul>
      )}
      {editable ? <KeepForm writer={writer} /> : null}
    </div>
  );
}
