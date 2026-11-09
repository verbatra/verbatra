import type { ValueReplacePreview, ValueReplacePreviewEntry } from "@verbatra/sdk";
import { Badge, Button } from "@verbatra/ui";
import type { ReactNode } from "react";
import type { StructuredError } from "../client/state.js";
import {
  BASELINE_UNAVAILABLE_NOTICE,
  countRows,
  EXCERPT_CUT_NOTICE,
  entriesToApply,
  keyedDetails,
  PIN_OPT_IN_LABEL,
  PROTECT_OPT_IN_LABEL,
  type ReplaceOptIns,
  reasonLabel,
  STALE_GATE_NOTICE,
  STATUS_LABEL,
  statusNote,
  statusTone,
  TRUNCATED_NOTICE,
  valueCount,
} from "../client/value-replace.js";
import { ErrorMessage } from "./ErrorMessage.js";
import { ReplaceCheck } from "./ReplaceCheck.js";
import { ReplaceLead } from "./ReplaceLead.js";
import { ReplacePagedList } from "./ReplacePagedList.js";
import { TranslationValue } from "./TranslationValue.js";

const VALUE_CLASSES = "block min-w-0 whitespace-pre-wrap wrap-anywhere text-sm";

function Excerpt({
  label,
  value,
  locale,
}: {
  readonly label: string;
  readonly value: string;
  readonly locale: string;
}): ReactNode {
  return (
    <div className="min-w-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <TranslationValue
        value={value}
        locale={locale}
        className={VALUE_CLASSES}
        data-replace-excerpt={label.toLowerCase()}
      />
    </div>
  );
}

function PreviewRow({ entry }: { readonly entry: ValueReplacePreviewEntry }): ReactNode {
  return (
    <div data-replace-entry="" data-locale={entry.locale} data-status={entry.status}>
      <p className="m-0 mb-1 flex min-w-0 flex-wrap items-center gap-2">
        <Badge verbatim>{entry.locale}</Badge>
        <span dir="ltr" className="min-w-0 font-mono text-sm wrap-anywhere text-foreground">
          {entry.key}
        </span>
        <Badge tone={statusTone(entry.status)} verbatim>
          {STATUS_LABEL[entry.status]}
        </Badge>
      </p>
      <p className="m-0 mb-2 text-sm text-muted-foreground" data-replace-note="">
        {statusNote(entry.status)}
      </p>
      {entry.reason !== undefined ? (
        <p className="m-0 mb-2 text-sm text-danger" data-replace-reason="">
          {`Would be refused: ${reasonLabel(entry.reason)}.`}
          {keyedDetails(entry.details ?? []).map((detail) => (
            <TranslationValue
              key={detail.key}
              value={detail.text}
              locale={entry.locale}
              className="block wrap-anywhere"
              data-replace-detail=""
            />
          ))}
        </p>
      ) : null}
      <Excerpt label="Now" value={entry.before} locale={entry.locale} />
      {entry.after === "" && entry.status === "too-long" ? null : (
        <Excerpt label="After" value={entry.after} locale={entry.locale} />
      )}
      {entry.excerptCut ? (
        <p className="m-0 mt-1 text-xs text-muted-foreground">{EXCERPT_CUT_NOTICE}</p>
      ) : null}
    </div>
  );
}

function Notices({ preview }: { readonly preview: ValueReplacePreview }): ReactNode {
  return (
    <>
      {preview.truncated ? (
        <p role="status" className="m-0 mb-3 text-sm text-warning" data-replace-truncated="">
          {TRUNCATED_NOTICE}
        </p>
      ) : null}
      {preview.baselineUnavailable === true ? (
        <p role="status" className="m-0 mb-3 text-sm text-warning" data-replace-baseline="">
          {BASELINE_UNAVAILABLE_NOTICE}
        </p>
      ) : null}
      {preview.counts["stale-source"] > 0 ? (
        <p className="m-0 mb-3 text-sm text-muted-foreground" data-replace-stale-note="">
          {STALE_GATE_NOTICE}
        </p>
      ) : null}
    </>
  );
}

function OptIns({
  preview,
  optIns,
  disabled,
  onChange,
}: {
  readonly preview: ValueReplacePreview;
  readonly optIns: ReplaceOptIns;
  readonly disabled: boolean;
  readonly onChange: (name: keyof ReplaceOptIns, value: boolean) => void;
}): ReactNode {
  const { pinned, protected: guarded } = preview.counts;
  if (pinned === 0 && guarded === 0) {
    return null;
  }
  return (
    <fieldset className="m-0 mb-4 flex min-w-0 flex-col gap-1 border-0 p-0" data-replace-optins="">
      <legend className="mb-1 text-sm font-medium text-foreground">
        Left out unless you opt in
      </legend>
      {pinned > 0 ? (
        <ReplaceCheck
          checked={optIns.includePinned}
          disabled={disabled}
          onChange={(value) => onChange("includePinned", value)}
          data-replace-optin="pinned"
        >
          {PIN_OPT_IN_LABEL} ({pinned})
        </ReplaceCheck>
      ) : null}
      {guarded > 0 ? (
        <ReplaceCheck
          checked={optIns.includeProtected}
          disabled={disabled}
          onChange={(value) => onChange("includeProtected", value)}
          data-replace-optin="protected"
        >
          {PROTECT_OPT_IN_LABEL} ({guarded})
        </ReplaceCheck>
      ) : null}
    </fieldset>
  );
}

export function ReplaceReviewStep({
  preview,
  optIns,
  applying,
  error,
  onOptIn,
  onApply,
  onBack,
}: {
  readonly preview: ValueReplacePreview;
  readonly optIns: ReplaceOptIns;
  readonly applying: boolean;
  readonly error: StructuredError | null;
  readonly onOptIn: (name: keyof ReplaceOptIns, value: boolean) => void;
  readonly onApply: () => void;
  readonly onBack: () => void;
}): ReactNode {
  const sendable = entriesToApply(preview, optIns).length;
  const none = preview.entries.length === 0;
  return (
    <div data-replace-step="review">
      <ReplaceLead>
        {none
          ? "No translation contains this text in the chosen locales."
          : `${valueCount(preview.entries.length)} match.`}
      </ReplaceLead>
      {error !== null ? <ErrorMessage error={error} /> : null}
      {none ? null : (
        <p className="m-0 mb-3 flex flex-wrap gap-2" data-replace-counts="">
          {countRows(preview).map((row) => (
            <Badge key={row.status} tone={statusTone(row.status)} verbatim>
              {row.label}: {row.count}
            </Badge>
          ))}
        </p>
      )}
      <Notices preview={preview} />
      <OptIns preview={preview} optIns={optIns} disabled={applying} onChange={onOptIn} />
      <ReplacePagedList
        items={preview.entries}
        itemKey={(entry) => `${entry.locale}\u0000${entry.key}`}
        render={(entry) => <PreviewRow entry={entry} />}
        listAttribute="data-replace-list"
      />
      {sendable === 0 && !none ? (
        <p className="m-0 mb-3 text-sm text-muted-foreground" data-replace-nothing="">
          Nothing can be replaced as it stands.
        </p>
      ) : null}
      <span className="flex flex-wrap items-center gap-3">
        <Button
          variant="primary"
          size="md"
          disabled={sendable === 0}
          aria-disabled={applying || undefined}
          aria-busy={applying || undefined}
          onClick={applying ? undefined : onApply}
          data-replace-apply=""
        >
          {applying ? "Replacing…" : `Replace ${valueCount(sendable)}`}
        </Button>
        <Button
          size="md"
          aria-disabled={applying || undefined}
          onClick={applying ? undefined : onBack}
        >
          Back
        </Button>
      </span>
    </div>
  );
}
