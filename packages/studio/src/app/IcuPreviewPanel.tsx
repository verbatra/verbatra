import type { IcuPreviewFailure, IcuPreviewRow, IcuSegment } from "@verbatra/sdk";
import { Badge, Button, Icon, TextField } from "@verbatra/ui";
import type { KeyboardEvent, ReactNode } from "react";
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  groupRows,
  ICU_FAILURE_COPY,
  ICU_PREVIEW_FIELD_LIMIT,
  isBlankPreview,
  prepareSamples,
  type RowGroup,
  SAMPLE_PROBLEM_COPY,
  type SampleField,
  type SampleProblem,
  sampleFields,
  type ValidIcuPreview,
} from "../client/icu-preview.js";
import type { SessionSamples } from "../client/icu-sample-session.js";
import { ErrorMessage } from "./ErrorMessage.js";
import {
  icuPreviewOpenStore,
  icuSampleSessions,
  useIcuPreviewAvailable,
  useIcuPreviewOpen,
} from "./icu-preview-open.js";
import { cn } from "./lib/cn.js";
import { valueDirection } from "./TranslationValue.js";
import { useIcuPreview } from "./use-icu-preview.js";

const FOCUS_TARGET =
  "scroll-mt-28 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring";

const ARGUMENT_CLASSES = "rounded-sm bg-accent px-0.5 text-accent-foreground";
const STALE_ARGUMENT_CLASSES = "rounded-sm bg-muted px-0.5 text-muted-foreground";
const STALE_NOTE = "These rows are from the last valid text.";
const TAG_CLASSES = "font-mono text-[0.92em] text-muted-foreground";

function SegmentText({
  segments,
  stale,
}: {
  readonly segments: readonly IcuSegment[];
  readonly stale: boolean;
}): ReactNode {
  return segments.map((segment, index) =>
    segment.kind === "text" ? (
      <span key={index}>{segment.text}</span>
    ) : (
      <bdi
        key={index}
        dir={segment.kind === "argument" ? "auto" : "ltr"}
        data-icu-segment={segment.kind}
        className={cn(
          "whitespace-pre-wrap",
          segment.kind === "argument"
            ? stale
              ? STALE_ARGUMENT_CLASSES
              : ARGUMENT_CLASSES
            : TAG_CLASSES,
        )}
      >
        {segment.text}
      </bdi>
    ),
  );
}

function heldText(held: RowGroup["held"]): string {
  return held.map(([name, value]) => `${name}=${value}`).join(",");
}

function HeldPairs({ held }: { readonly held: RowGroup["held"] }): ReactNode {
  return held.map(([name, value]) => (
    <span key={name} className="inline-flex min-w-0 items-baseline gap-1">
      <span dir="ltr" className="font-mono wrap-anywhere">
        {name}
      </span>
      <span aria-hidden="true">=</span>
      <bdi dir="auto" className="wrap-anywhere">
        {String(value)}
      </bdi>
    </span>
  ));
}

function RowHeader({ row }: { readonly row: IcuPreviewRow }): ReactNode {
  if (row.argument === null) {
    return <span>Rendered text</span>;
  }
  const numeric = row.axis === "plural" || row.axis === "ordinal" || row.supplied;
  return (
    <>
      {row.supplied ? <span className="font-semibold text-foreground">Your value</span> : null}
      {row.supplied ? <HeldPairs held={Object.entries(row.held)} /> : null}
      <span dir="ltr" className="font-mono wrap-anywhere">
        {row.argument}
      </span>
      <Badge verbatim wrap>
        {row.category}
      </Badge>
      {numeric ? (
        <span dir="auto" className="min-w-0 font-mono wrap-anywhere">
          {`= ${row.sample}`}
        </span>
      ) : null}
    </>
  );
}

function PreviewRow({
  row,
  locale,
  stale,
}: {
  readonly row: IcuPreviewRow;
  readonly locale: string;
  readonly stale: boolean;
}): ReactNode {
  const text = row.segments.map((segment) => segment.text).join("");
  return (
    <li
      className="min-w-0 rounded-sm border border-border bg-card px-3 py-2"
      data-icu-row=""
      data-axis={row.axis}
      data-supplied={row.supplied ? "" : undefined}
      data-argument={row.argument ?? undefined}
      data-category={row.category ?? undefined}
    >
      <p className="m-0 mb-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <RowHeader row={row} />
      </p>
      <p
        className={cn(
          "m-0 whitespace-pre-wrap text-start text-sm wrap-anywhere",
          stale && "text-muted-foreground",
        )}
        lang={locale}
        dir={valueDirection(locale, text)}
        data-icu-text=""
      >
        <SegmentText segments={row.segments} stale={stale} />
      </p>
    </li>
  );
}

function HeldHeading({ held }: { readonly held: RowGroup["held"] }): ReactNode {
  return (
    <p
      className="m-0 mb-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold text-foreground"
      data-icu-held={heldText(held)}
    >
      <HeldPairs held={held} />
    </p>
  );
}

function Rows({
  answer,
  locale,
  stale = false,
}: {
  readonly answer: ValidIcuPreview;
  readonly locale: string;
  readonly stale?: boolean;
}): ReactNode {
  if (isBlankPreview(answer.rows)) {
    return (
      <p className="m-0 text-sm text-muted-foreground" data-icu-empty="">
        The draft is empty, so there is nothing to render.
      </p>
    );
  }
  return (
    <>
      <ul className="m-0 flex list-none flex-col gap-3 p-0" data-icu-rows="">
        {groupRows(answer.rows).map((group, groupIndex) => (
          <li
            key={groupIndex}
            className={cn("min-w-0", group.held.length > 0 && "border-s-2 border-border ps-2")}
            data-icu-group={group.held.length > 0 ? heldText(group.held) : undefined}
            data-icu-supplied={group.supplied ? "" : undefined}
          >
            {group.held.length > 0 ? <HeldHeading held={group.held} /> : null}
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {group.rows.map((row, index) => (
                <PreviewRow key={index} row={row} locale={locale} stale={stale} />
              ))}
            </ul>
          </li>
        ))}
      </ul>
      {answer.truncated ? (
        <p className="m-0 mt-2 text-xs text-muted-foreground" data-icu-truncated="">
          Some arms have no row here: the preview shows at most 24 rows and a limited amount of
          text.
        </p>
      ) : null}
    </>
  );
}

const REFUSAL_REASONS = Object.keys(ICU_FAILURE_COPY) as readonly IcuPreviewFailure[];

function NoticeBlock({
  refusal,
  staleShown,
  updating,
}: {
  readonly refusal: IcuPreviewFailure | null;
  readonly staleShown: boolean;
  readonly updating: boolean;
}): ReactNode {
  return (
    <div className="mb-2 grid min-w-0" data-icu-notice="">
      <p
        role="status"
        className="col-start-1 row-start-1 m-0 min-h-5 text-xs text-muted-foreground"
        data-icu-status=""
      >
        {updating && refusal === null ? "Updating…" : ""}
      </p>
      {REFUSAL_REASONS.map((reason) => {
        const active = refusal === reason;
        return (
          <div
            key={reason}
            className={cn("col-start-1 row-start-1 min-w-0", !active && "invisible")}
            aria-hidden={active ? undefined : true}
            data-icu-refusal={active ? reason : undefined}
          >
            <p className="m-0 text-sm text-muted-foreground">{ICU_FAILURE_COPY[reason]}</p>
            <p
              className={cn(
                "m-0 mt-1 text-xs text-muted-foreground",
                !(active && staleShown) && "invisible",
              )}
              data-icu-stale-note={active && staleShown ? "" : undefined}
            >
              {STALE_NOTE}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function SampleInputs({
  fields,
  total,
  inputs,
  problems,
  onChange,
  onEscape,
}: {
  readonly fields: readonly SampleField[];
  readonly total: number;
  readonly inputs: ReadonlyMap<string, string>;
  readonly problems: ReadonlyMap<string, SampleProblem>;
  readonly onChange: (name: string, text: string) => void;
  readonly onEscape: () => void;
}): ReactNode {
  const baseId = useId();
  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "Escape" && !event.nativeEvent.isComposing) {
      event.stopPropagation();
      event.preventDefault();
      onEscape();
    }
  }
  return (
    <fieldset className="m-0 mb-1 min-w-0 border-0 p-0" data-icu-samples="">
      <legend className="mb-1 p-0 text-xs font-semibold text-foreground">Sample values</legend>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-x-3 gap-y-2">
        {fields.map((field, index) => {
          const problem = problems.get(field.name);
          const fieldId = `${baseId}-${index}`;
          const noteId = `${fieldId}-note`;
          return (
            <div key={field.name} className="min-w-0" data-icu-sample={field.name}>
              <label htmlFor={fieldId} className="mb-0.5 block text-xs text-muted-foreground">
                <span dir="ltr" className="font-mono wrap-anywhere">
                  {field.name}
                </span>
              </label>
              <TextField
                id={fieldId}
                size="xs"
                autoComplete="off"
                spellCheck={false}
                dir="auto"
                inputMode="text"
                placeholder="automatic"
                data-icu-sample-input={field.name}
                value={inputs.get(field.name) ?? ""}
                aria-invalid={problem !== undefined ? true : undefined}
                aria-describedby={problem !== undefined ? noteId : undefined}
                onChange={(event) => onChange(field.name, event.target.value)}
                onKeyDown={handleKeyDown}
              />
              {problem !== undefined ? (
                <p
                  id={noteId}
                  className="m-0 mt-0.5 text-xs text-danger"
                  data-icu-sample-problem=""
                >
                  {SAMPLE_PROBLEM_COPY[problem]}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
      <p className="m-0 mt-1 text-xs text-muted-foreground">
        Leave a field empty to use an automatic value.
        {total > fields.length
          ? ` Showing the first ${ICU_PREVIEW_FIELD_LIMIT} of ${total} arguments.`
          : ""}
      </p>
    </fieldset>
  );
}

function sameFields(first: readonly SampleField[], second: readonly SampleField[]): boolean {
  return (
    first.length === second.length &&
    first.every((field, index) => {
      const other = second[index];
      return other !== undefined && other.name === field.name && other.type === field.type;
    })
  );
}

function IcuPreviewBody({
  locale,
  value,
  sessionKey,
  onNotIcu,
  onEscape,
}: {
  readonly locale: string;
  readonly value: string;
  readonly sessionKey: string;
  readonly onNotIcu: () => void;
  readonly onEscape: () => void;
}): ReactNode {
  const [held, setHeld] = useState<SessionSamples>(() => icuSampleSessions.samples(sessionKey));
  const { inputs, fields } = held;
  const shown = useMemo(() => fields.slice(0, ICU_PREVIEW_FIELD_LIMIT), [fields]);
  const samples = useMemo(() => prepareSamples(shown, inputs), [shown, inputs]);
  const read = useIcuPreview({ locale, value, samples });
  const regionRef = useRef<HTMLDivElement | null>(null);
  const retryPressed = useRef(false);
  const { view, lastValid, pending, retrying, retry } = read;

  useEffect(() => {
    icuSampleSessions.setSamples(sessionKey, held);
  }, [sessionKey, held]);

  useEffect(() => {
    const restore = icuSampleSessions.takeFocus(sessionKey, Date.now());
    if (restore === undefined) {
      return;
    }
    const timer = window.setTimeout(() => {
      const field = [
        ...(regionRef.current?.querySelectorAll<HTMLInputElement>("input[data-icu-sample-input]") ??
          []),
      ].find((input) => input.dataset.icuSampleInput === restore.name);
      field?.focus();
      if (field !== undefined && restore.start !== null && restore.end !== null) {
        field.setSelectionRange(restore.start, restore.end);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [sessionKey]);

  useLayoutEffect(() => {
    const region = regionRef.current;
    return () => {
      const active = document.activeElement;
      if (
        active instanceof HTMLInputElement &&
        region?.contains(active) === true &&
        active.dataset.icuSampleInput !== undefined
      ) {
        icuSampleSessions.rememberFocus(
          sessionKey,
          {
            name: active.dataset.icuSampleInput,
            start: active.selectionStart,
            end: active.selectionEnd,
          },
          Date.now(),
        );
      }
    };
  }, [sessionKey]);

  useEffect(() => {
    if (view.kind === "not-icu") {
      onNotIcu();
    }
  }, [view.kind, onNotIcu]);

  useEffect(() => {
    if (lastValid === undefined) {
      return;
    }
    const next = sampleFields(lastValid.arguments);
    setHeld((current) =>
      sameFields(current.fields, next) ? current : { inputs: current.inputs, fields: next },
    );
  }, [lastValid]);

  useEffect(() => {
    retryPressed.current = false;
  }, [value]);

  useEffect(() => {
    if (!retryPressed.current || retrying) {
      return;
    }
    retryPressed.current = false;
    if (view.kind === "error") {
      return;
    }
    const region = regionRef.current;
    const active = document.activeElement;
    const inSamples = active instanceof Element && active.closest("[data-icu-samples]") !== null;
    if (active === document.body || (region?.contains(active) === true && !inSamples)) {
      region?.focus();
    }
  }, [retrying, view.kind]);

  const refusal = view.kind === "answer" && !view.answer.valid ? view.answer : null;
  const answer = view.kind === "answer" && view.answer.valid ? view.answer : null;
  const staleRows = (refusal !== null || view.kind === "error") && lastValid !== undefined;

  return (
    <div
      ref={regionRef}
      tabIndex={-1}
      data-recovery-target="icu-preview"
      className={cn("mt-2", FOCUS_TARGET)}
    >
      <p className="m-0 mb-2 text-xs text-muted-foreground">
        Uses this computer&apos;s language data, so your app may differ.
      </p>
      <NoticeBlock
        refusal={refusal?.reason ?? null}
        staleShown={staleRows}
        updating={pending || view.kind === "loading"}
      />
      {shown.length > 0 ? (
        <SampleInputs
          fields={shown}
          total={fields.length}
          inputs={inputs}
          problems={samples.problems}
          onChange={(name, text) => {
            retryPressed.current = false;
            setHeld((current) => ({
              inputs: new Map(current.inputs).set(name, text),
              fields: current.fields,
            }));
          }}
          onEscape={onEscape}
        />
      ) : null}
      {view.kind === "error" ? (
        <ErrorMessage
          error={view.error}
          retrying={retrying}
          onRetry={() => {
            retryPressed.current = true;
            retry();
          }}
        />
      ) : null}
      {staleRows ? (
        <div data-icu-stale="">
          {view.kind === "error" ? (
            <p className="m-0 mb-2 text-xs text-muted-foreground">{STALE_NOTE}</p>
          ) : null}
          <Rows answer={lastValid} locale={locale} stale />
        </div>
      ) : null}
      {answer !== null ? <Rows answer={answer} locale={locale} /> : null}
    </div>
  );
}

function IcuPreviewSection({
  locale,
  value,
  sessionKey,
}: {
  readonly locale: string;
  readonly value: string;
  readonly sessionKey: string;
}): ReactNode {
  const open = useIcuPreviewOpen();
  const bodyId = useId();
  const toggleRef = useRef<HTMLButtonElement | null>(null);
  const [notIcu, setNotIcu] = useState(false);
  const hide = useCallback(() => setNotIcu(true), []);
  const backToToggle = useCallback(() => toggleRef.current?.focus(), []);
  if (notIcu) {
    return null;
  }
  return (
    <section
      aria-label="ICU message preview"
      className="mt-3"
      data-icu-preview=""
      data-open={open ? "" : undefined}
    >
      <Button
        ref={toggleRef}
        size="sm"
        aria-expanded={open}
        aria-controls={open ? bodyId : undefined}
        onClick={() => icuPreviewOpenStore.setOpen(!open)}
      >
        <Icon name="chevron-down" size={14} className={cn(open && "rotate-180")} />
        ICU preview
      </Button>
      {open ? (
        <div id={bodyId}>
          <IcuPreviewBody
            locale={locale}
            value={value}
            sessionKey={sessionKey}
            onNotIcu={hide}
            onEscape={backToToggle}
          />
        </div>
      ) : null}
    </section>
  );
}

export function IcuPreviewPanel({
  keyName,
  locale,
  value,
}: {
  readonly keyName: string;
  readonly locale: string;
  readonly value: string;
}): ReactNode {
  const available = useIcuPreviewAvailable();
  if (!available) {
    return null;
  }
  return (
    <IcuPreviewSection locale={locale} value={value} sessionKey={`${keyName}\u0000${locale}`} />
  );
}
