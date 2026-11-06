import type { IcuPreviewRow, IcuSegment } from "@verbatra/sdk";
import { Badge, Button, Icon, TextField } from "@verbatra/ui";
import type { ReactNode } from "react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  formatUsesIcu,
  ICU_FAILURE_COPY,
  ICU_PREVIEW_FIELD_LIMIT,
  prepareSamples,
  SAMPLE_PROBLEM_COPY,
  type SampleField,
  type SampleProblem,
  sampleFields,
  type ValidIcuPreview,
} from "../client/icu-preview.js";
import { ErrorMessage } from "./ErrorMessage.js";
import { icuPreviewOpenStore, useIcuPreviewOpen } from "./icu-preview-open.js";
import { cn } from "./lib/cn.js";
import { valueDirection } from "./TranslationValue.js";
import { useIcuPreview } from "./use-icu-preview.js";
import { useProjectFormat } from "./use-project-format.js";

const FOCUS_TARGET =
  "scroll-mt-28 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring";

const ARGUMENT_CLASSES =
  "rounded-sm bg-accent px-0.5 font-mono text-[0.92em] text-accent-foreground";
const TAG_CLASSES = "font-mono text-[0.92em] text-muted-foreground";

function SegmentText({ segments }: { readonly segments: readonly IcuSegment[] }): ReactNode {
  return segments.map((segment, index) =>
    segment.kind === "text" ? (
      <span key={index}>{segment.text}</span>
    ) : (
      <bdi
        key={index}
        dir="ltr"
        data-icu-segment={segment.kind}
        className={cn(
          "whitespace-pre-wrap",
          segment.kind === "argument" ? ARGUMENT_CLASSES : TAG_CLASSES,
        )}
      >
        {segment.text}
      </bdi>
    ),
  );
}

function PreviewRow({
  row,
  locale,
}: {
  readonly row: IcuPreviewRow;
  readonly locale: string;
}): ReactNode {
  const text = row.segments.map((segment) => segment.text).join("");
  const varied = row.axis === "plural" || row.axis === "ordinal";
  return (
    <li
      className="min-w-0 rounded-sm border border-border bg-card px-3 py-2"
      data-icu-row=""
      data-axis={row.axis}
      data-argument={row.argument ?? undefined}
      data-category={row.category ?? undefined}
    >
      <p className="m-0 mb-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        {row.argument === null ? (
          <span>No argument to vary</span>
        ) : (
          <>
            <span dir="ltr" className="font-mono wrap-anywhere">
              {row.argument}
            </span>
            <Badge verbatim wrap>
              {row.category}
            </Badge>
            {varied ? (
              <span dir="ltr" className="font-mono">
                {`= ${row.sample}`}
              </span>
            ) : null}
          </>
        )}
      </p>
      <p
        className="m-0 whitespace-pre-wrap text-start text-sm wrap-anywhere"
        lang={locale}
        dir={valueDirection(locale, text)}
        data-icu-text=""
      >
        <SegmentText segments={row.segments} />
      </p>
    </li>
  );
}

function SampleInputs({
  fields,
  total,
  inputs,
  problems,
  onChange,
}: {
  readonly fields: readonly SampleField[];
  readonly total: number;
  readonly inputs: ReadonlyMap<string, string>;
  readonly problems: ReadonlyMap<string, SampleProblem>;
  readonly onChange: (name: string, text: string) => void;
}): ReactNode {
  const baseId = useId();
  return (
    <fieldset className="m-0 mb-3 min-w-0 border-0 p-0" data-icu-samples="">
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
                inputMode={field.type === "number" || field.type === "date" ? "decimal" : "text"}
                placeholder="default"
                value={inputs.get(field.name) ?? ""}
                aria-invalid={problem !== undefined ? true : undefined}
                aria-describedby={problem !== undefined ? noteId : undefined}
                onChange={(event) => onChange(field.name, event.target.value)}
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
      {total > fields.length ? (
        <p className="m-0 mt-1 text-xs text-muted-foreground">
          {`Showing the first ${ICU_PREVIEW_FIELD_LIMIT} of ${total} arguments.`}
        </p>
      ) : null}
    </fieldset>
  );
}

function Rows({
  answer,
  locale,
}: {
  readonly answer: ValidIcuPreview;
  readonly locale: string;
}): ReactNode {
  return (
    <>
      <ul className="m-0 flex list-none flex-col gap-2 p-0" data-icu-rows="">
        {answer.rows.map((row, index) => (
          <PreviewRow key={index} row={row} locale={locale} />
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

function IcuPreviewBody({
  locale,
  value,
  onNotIcu,
}: {
  readonly locale: string;
  readonly value: string;
  readonly onNotIcu: () => void;
}): ReactNode {
  const [inputs, setInputs] = useState<ReadonlyMap<string, string>>(new Map());
  const [fields, setFields] = useState<readonly SampleField[]>([]);
  const shown = useMemo(() => fields.slice(0, ICU_PREVIEW_FIELD_LIMIT), [fields]);
  const samples = useMemo(() => prepareSamples(shown, inputs), [shown, inputs]);
  const read = useIcuPreview({ locale, value, samples });
  const regionRef = useRef<HTMLDivElement | null>(null);
  const retryPressed = useRef(false);
  const { view, pending, retrying, retry } = read;

  useEffect(() => {
    if (view.kind === "not-icu") {
      onNotIcu();
    }
  }, [view.kind, onNotIcu]);

  useEffect(() => {
    if (view.kind === "answer" && view.answer.valid) {
      setFields(sampleFields(view.answer.arguments));
    }
  }, [view]);

  useEffect(() => {
    if (retryPressed.current && !retrying && view.kind !== "error") {
      retryPressed.current = false;
      regionRef.current?.focus();
    }
  }, [retrying, view.kind]);

  useEffect(() => {
    if (retryPressed.current && !retrying && view.kind === "error") {
      retryPressed.current = false;
    }
  }, [retrying, view.kind]);

  return (
    <div
      ref={regionRef}
      tabIndex={-1}
      data-recovery-target="icu-preview"
      className={cn("mt-2", FOCUS_TARGET)}
    >
      <p className="m-0 mb-2 text-xs text-muted-foreground">
        Rendered with this machine&apos;s Node CLDR data, not your app&apos;s runtime.
      </p>
      {shown.length > 0 ? (
        <SampleInputs
          fields={shown}
          total={fields.length}
          inputs={inputs}
          problems={samples.problems}
          onChange={(name, text) => setInputs((current) => new Map(current).set(name, text))}
        />
      ) : null}
      <p className="m-0 mb-2 min-h-5 text-xs text-muted-foreground" data-icu-status="">
        {pending || view.kind === "loading" ? "Updating…" : ""}
      </p>
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
      {view.kind === "answer" && !view.answer.valid ? (
        <p className="m-0 text-sm text-muted-foreground" data-icu-refusal={view.answer.reason}>
          {ICU_FAILURE_COPY[view.answer.reason]}
        </p>
      ) : null}
      {view.kind === "answer" && view.answer.valid ? (
        <Rows answer={view.answer} locale={locale} />
      ) : null}
    </div>
  );
}

function IcuPreviewSection({
  locale,
  value,
}: {
  readonly locale: string;
  readonly value: string;
}): ReactNode {
  const open = useIcuPreviewOpen();
  const bodyId = useId();
  const [notIcu, setNotIcu] = useState(false);
  const hide = useCallback(() => setNotIcu(true), []);
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
          <IcuPreviewBody locale={locale} value={value} onNotIcu={hide} />
        </div>
      ) : null}
    </section>
  );
}

export function IcuPreviewPanel({
  locale,
  value,
}: {
  readonly locale: string;
  readonly value: string;
}): ReactNode {
  const project = useProjectFormat();
  if (project.kind !== "known" || !formatUsesIcu(project.format)) {
    return null;
  }
  return <IcuPreviewSection locale={locale} value={value} />;
}
