import { Button, TextField } from "@verbatra/ui";
import type { FormEvent, ReactNode, RefObject } from "react";
import { useEffect, useId, useRef, useState } from "react";
import type { StructuredError } from "../client/state.js";
import {
  criteriaFieldOf,
  type ReplaceCriteria,
  withGroupedNumbers,
} from "../client/value-replace.js";
import { ErrorMessage } from "./ErrorMessage.js";
import { ReplaceCheck } from "./ReplaceCheck.js";

const FIND_MISSING = "Enter the text to find.";
const LOCALES_MISSING = "Choose at least one locale to search.";

type LocalProblem = "find" | "locales";

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
    <div>
      <label htmlFor={input} className="mb-1 block text-sm font-medium text-foreground">
        {label}
      </label>
      {children({ input, described: note })}
      <p
        id={note}
        role={invalid === undefined ? undefined : "alert"}
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
  invalid,
  scopeRef,
  onToggle,
}: {
  readonly locales: readonly string[];
  readonly chosen: readonly string[];
  readonly invalid: boolean;
  readonly scopeRef: RefObject<HTMLFieldSetElement | null>;
  readonly onToggle: (locale: string) => void;
}): ReactNode {
  return (
    <fieldset
      ref={scopeRef}
      className="m-0 min-w-0 border-0 p-0"
      aria-describedby={invalid ? "replace-locales-note" : undefined}
      data-replace-locales=""
    >
      <legend className="mb-1 text-sm font-medium text-foreground">Locales to search</legend>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
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
      {invalid ? (
        <p id="replace-locales-note" role="alert" className="m-0 mt-1 text-xs text-danger">
          {LOCALES_MISSING}
        </p>
      ) : null}
    </fieldset>
  );
}

export function ReplaceCriteriaStep({
  allLocales,
  busy,
  error,
  initial,
  findRef,
  onPreview,
  onClose,
}: {
  readonly findRef: RefObject<HTMLInputElement | null>;
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
  const [problem, setProblem] = useState<LocalProblem | null>(null);
  const replaceRef = useRef<HTMLInputElement | null>(null);
  const scopeRef = useRef<HTMLFieldSetElement | null>(null);
  const invalidField = criteriaFieldOf(error);
  const serverMessage = error === null ? undefined : withGroupedNumbers(error.message);
  const findError =
    problem === "find" ? FIND_MISSING : invalidField === "find" ? serverMessage : undefined;
  const replaceError = invalidField === "replace" ? serverMessage : undefined;
  const otherError = invalidField === null ? error : null;

  useEffect(() => {
    findRef.current?.focus();
  }, []);

  useEffect(() => {
    if (invalidField === "find") {
      findRef.current?.focus();
    } else if (invalidField === "replace") {
      replaceRef.current?.focus();
    }
  }, [invalidField, error]);

  function submit(event: FormEvent): void {
    event.preventDefault();
    if (busy) {
      return;
    }
    if (find === "") {
      setProblem("find");
      findRef.current?.focus();
    } else if (locales.length === 0) {
      setProblem("locales");
      scopeRef.current?.querySelector("input")?.focus();
    } else {
      setProblem(null);
      onPreview({ find, replace, caseSensitive, locales });
    }
  }

  function toggleLocale(locale: string): void {
    setProblem(null);
    setLocales((current) =>
      current.includes(locale)
        ? current.filter((candidate) => candidate !== locale)
        : allLocales.filter((candidate) => candidate === locale || current.includes(candidate)),
    );
  }

  return (
    <form onSubmit={submit} data-replace-step="criteria" noValidate className="flex flex-col gap-4">
      {otherError !== null ? <ErrorMessage error={otherError} /> : null}
      <Field
        label="Find"
        hint="Matched literally in translations only, never in the source text. Up to 20,000 characters."
        invalid={findError}
      >
        {({ input, described }) => (
          <TextField
            id={input}
            ref={findRef}
            value={find}
            dir="auto"
            autoComplete="off"
            spellCheck={false}
            aria-invalid={findError !== undefined ? true : undefined}
            aria-describedby={described}
            readOnly={busy}
            onChange={(event) => {
              setProblem(null);
              setFind(event.target.value);
            }}
            data-replace-find=""
          />
        )}
      </Field>
      <Field
        label="Replace with"
        hint="Inserted exactly as typed. $&, $1 and backslashes have no special meaning. Leave empty to remove the text."
        invalid={replaceError}
      >
        {({ input, described }) => (
          <TextField
            id={input}
            ref={replaceRef}
            value={replace}
            dir="auto"
            autoComplete="off"
            spellCheck={false}
            aria-invalid={replaceError !== undefined ? true : undefined}
            aria-describedby={described}
            readOnly={busy}
            onChange={(event) => setReplace(event.target.value)}
            data-replace-with=""
          />
        )}
      </Field>
      <ReplaceCheck checked={caseSensitive} onChange={setCaseSensitive} data-replace-case="">
        Match case
      </ReplaceCheck>
      <LocaleScope
        locales={allLocales}
        chosen={locales}
        invalid={problem === "locales"}
        scopeRef={scopeRef}
        onToggle={toggleLocale}
      />
      <span className="flex flex-wrap items-center gap-3">
        <Button
          type="submit"
          variant="primary"
          size="md"
          aria-disabled={busy || undefined}
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
