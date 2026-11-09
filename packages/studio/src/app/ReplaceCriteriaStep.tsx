import { Button, TextField } from "@verbatra/ui";
import type { FormEvent, ReactNode } from "react";
import { useId, useState } from "react";
import type { StructuredError } from "../client/state.js";
import type { ReplaceCriteria } from "../client/value-replace.js";
import { ErrorMessage } from "./ErrorMessage.js";
import { ReplaceCheck } from "./ReplaceCheck.js";

const FIND_FIELD_CODE = "FIND_TEXT_INVALID";

function Field({
  label,
  hint,
  invalid,
  children,
}: {
  readonly label: string;
  readonly hint: string;
  readonly invalid?: string | undefined;
  readonly children: (ids: { readonly input: string; readonly described: string }) => ReactNode;
}): ReactNode {
  const base = useId();
  const input = `${base}-input`;
  const note = `${base}-note`;
  return (
    <div className="mb-4">
      <label htmlFor={input} className="mb-1 block text-sm font-medium text-foreground">
        {label}
      </label>
      {children({ input, described: note })}
      <p
        id={note}
        className={
          invalid === undefined
            ? "m-0 mt-1 text-xs text-muted-foreground"
            : "m-0 mt-1 text-xs text-danger"
        }
        data-field-note=""
      >
        {invalid ?? hint}
      </p>
    </div>
  );
}

function LocaleScope({
  locales,
  chosen,
  onToggle,
}: {
  readonly locales: readonly string[];
  readonly chosen: readonly string[];
  readonly onToggle: (locale: string) => void;
}): ReactNode {
  return (
    <fieldset className="m-0 mb-4 min-w-0 border-0 p-0" data-replace-locales="">
      <legend className="mb-1 text-sm font-medium text-foreground">Locales to search</legend>
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {locales.map((locale) => (
          <ReplaceCheck
            key={locale}
            checked={chosen.includes(locale)}
            onChange={() => onToggle(locale)}
            data-replace-locale={locale}
          >
            <span dir="ltr" className="font-mono">
              {locale}
            </span>
          </ReplaceCheck>
        ))}
      </div>
    </fieldset>
  );
}

export function ReplaceCriteriaStep({
  allLocales,
  busy,
  error,
  initial,
  onPreview,
  onClose,
}: {
  readonly allLocales: readonly string[];
  readonly busy: boolean;
  readonly error: StructuredError | null;
  readonly initial: ReplaceCriteria | null;
  readonly onPreview: (criteria: ReplaceCriteria) => void;
  readonly onClose: () => void;
}): ReactNode {
  const [find, setFind] = useState(initial?.find ?? "");
  const [replace, setReplace] = useState(initial?.replace ?? "");
  const [caseSensitive, setCaseSensitive] = useState(initial?.caseSensitive ?? true);
  const [locales, setLocales] = useState<readonly string[]>(initial?.locales ?? allLocales);
  const findError = error?.code === FIND_FIELD_CODE ? error.message : undefined;
  const otherError = error !== null && findError === undefined ? error : null;
  const ready = find !== "" && locales.length > 0 && !busy;

  function submit(event: FormEvent): void {
    event.preventDefault();
    if (ready) {
      onPreview({ find, replace, caseSensitive, locales });
    }
  }

  return (
    <form onSubmit={submit} data-replace-step="criteria" noValidate>
      {otherError !== null ? <ErrorMessage error={otherError} /> : null}
      <Field
        label="Find"
        hint="Matched literally in translations only, never in the source text. Up to 20,000 characters."
        invalid={findError}
      >
        {({ input, described }) => (
          <TextField
            id={input}
            value={find}
            dir="auto"
            autoComplete="off"
            spellCheck={false}
            aria-invalid={findError !== undefined ? true : undefined}
            aria-describedby={described}
            readOnly={busy}
            onChange={(event) => setFind(event.target.value)}
            data-replace-find=""
          />
        )}
      </Field>
      <Field
        label="Replace with"
        hint="Inserted exactly as typed. $&, $1 and backslashes have no special meaning. Leave empty to remove the text."
      >
        {({ input, described }) => (
          <TextField
            id={input}
            value={replace}
            dir="auto"
            autoComplete="off"
            spellCheck={false}
            aria-describedby={described}
            readOnly={busy}
            onChange={(event) => setReplace(event.target.value)}
            data-replace-with=""
          />
        )}
      </Field>
      <div className="mb-4">
        <ReplaceCheck checked={caseSensitive} onChange={setCaseSensitive} data-replace-case="">
          Match case
        </ReplaceCheck>
      </div>
      <LocaleScope
        locales={allLocales}
        chosen={locales}
        onToggle={(locale) =>
          setLocales((current) =>
            current.includes(locale)
              ? current.filter((candidate) => candidate !== locale)
              : allLocales.filter(
                  (candidate) => candidate === locale || current.includes(candidate),
                ),
          )
        }
      />
      <span className="flex flex-wrap items-center gap-3">
        <Button
          type="submit"
          variant="primary"
          size="md"
          aria-disabled={!ready || undefined}
          aria-busy={busy || undefined}
        >
          {busy ? "Searching…" : "Preview"}
        </Button>
        <Button size="md" onClick={onClose}>
          Cancel
        </Button>
      </span>
    </form>
  );
}
