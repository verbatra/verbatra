import type { ReactNode, Ref } from "react";
import { useEffect, useRef, useState } from "react";
import {
  type GlossaryDoNotTranslateView,
  MAX_GLOSSARY_TERM_LENGTH,
} from "../shared/rpc/glossary.js";
import { Badge } from "./Badge.js";
import { Button } from "./Button.js";
import { CaseSensitiveToggle, type GlossaryWriter } from "./GlossaryTermRow.js";
import { TextField } from "./Input.js";

export const glossarySubheadingClassName = "m-0 mb-2 text-sm font-medium text-foreground";

type FocusTarget = { readonly kind: "term"; readonly term: string } | { readonly kind: "input" };

function KeptTerm({
  entry,
  editable,
  writer,
  buttonRef,
  onRemove,
}: {
  readonly entry: GlossaryDoNotTranslateView;
  readonly editable: boolean;
  readonly writer: GlossaryWriter;
  readonly buttonRef: Ref<HTMLButtonElement>;
  readonly onRemove: () => void;
}): ReactNode {
  return (
    <li className="flex min-w-0 max-w-full items-center gap-2 rounded-md border border-border bg-muted/40 px-2.5 py-1.5">
      <span
        className="min-w-0 font-mono text-sm text-accent-foreground [overflow-wrap:anywhere]"
        dir="auto"
      >
        {entry.term}
      </span>
      {entry.caseSensitive ? <Badge tone="neutral">Match case</Badge> : null}
      {editable ? (
        <Button
          ref={buttonRef}
          onClick={onRemove}
          disabled={writer.pending === entry.term}
          aria-label={`Remove ${entry.term} from do not translate`}
        >
          Remove
        </Button>
      ) : null}
    </li>
  );
}

function KeepForm({
  writer,
  inputRef,
}: {
  readonly writer: GlossaryWriter;
  readonly inputRef: Ref<HTMLInputElement>;
}): ReactNode {
  const [term, setTerm] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(true);
  const busy = writer.pending !== undefined;
  const trimmed = term.trim();
  const ready = trimmed.length > 0 && trimmed.length <= MAX_GLOSSARY_TERM_LENGTH;

  async function keep(): Promise<void> {
    const edit = caseSensitive
      ? { term: trimmed, doNotTranslate: true }
      : { term: trimmed, doNotTranslate: true, caseSensitive: false };
    if (await writer.write(edit)) {
      setTerm("");
      setCaseSensitive(true);
    }
  }

  return (
    <div className="mt-2 grid items-end gap-2 sm:grid-cols-[1fr_auto_auto]">
      <TextField
        ref={inputRef}
        aria-label="New do-not-translate term"
        placeholder="Brand or product name"
        dir="auto"
        className="max-w-none"
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
      <Button variant="primary" size="md" onClick={() => void keep()} disabled={busy || !ready}>
        Keep untranslated
      </Button>
    </div>
  );
}

function nextFocus(entries: readonly GlossaryDoNotTranslateView[], removed: string): FocusTarget {
  const index = entries.findIndex((entry) => entry.term === removed);
  const next = entries[index + 1] ?? entries[index - 1];
  return next === undefined ? { kind: "input" } : { kind: "term", term: next.term };
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
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const inputRef = useRef<HTMLInputElement>(null);
  const [focusTarget, setFocusTarget] = useState<FocusTarget | undefined>(undefined);

  useEffect(() => {
    if (focusTarget === undefined) {
      return;
    }
    const target =
      focusTarget.kind === "term" ? buttons.current.get(focusTarget.term) : inputRef.current;
    target?.focus();
    setFocusTarget(undefined);
  }, [focusTarget]);

  async function remove(term: string): Promise<void> {
    const target = nextFocus(entries, term);
    if (await writer.write({ term, doNotTranslate: false })) {
      setFocusTarget(target);
    }
  }

  if (entries.length === 0 && !editable) {
    return null;
  }
  return (
    <div className="mt-4 border-border border-t pt-4">
      <h3 className={glossarySubheadingClassName}>Do not translate</h3>
      {entries.length === 0 ? (
        <p className="m-0 text-sm text-muted-foreground">
          No term is kept untranslated yet. Add brand and product names here so every locale keeps
          them as written.
        </p>
      ) : (
        <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
          {entries.map((entry) => (
            <KeptTerm
              key={entry.term}
              entry={entry}
              editable={editable}
              writer={writer}
              buttonRef={(button) => {
                if (button === null) {
                  buttons.current.delete(entry.term);
                } else {
                  buttons.current.set(entry.term, button);
                }
              }}
              onRemove={() => void remove(entry.term)}
            />
          ))}
        </ul>
      )}
      {editable ? <KeepForm writer={writer} inputRef={inputRef} /> : null}
    </div>
  );
}
