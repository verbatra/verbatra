import type { ApplyValueReplaceResult, ValueReplacePreviewEntry } from "@verbatra/sdk";
import { Badge, Button } from "@verbatra/ui";
import type { ReactNode } from "react";
import {
  FILE_WRITTEN_NOTICE,
  failureViews,
  groupedCount,
  keyedDetails,
  type OutcomeRow,
  outcomeRows,
  replacedCount,
  STATUS_LABEL,
  statusNote,
  statusTone,
  TRUNCATED_NOTICE,
  valueCount,
} from "../client/value-replace.js";
import { ReplaceLead } from "./ReplaceLead.js";
import { ReplacePagedList } from "./ReplacePagedList.js";
import { TranslationValue } from "./TranslationValue.js";

function LocaleFailures({ result }: { readonly result: ApplyValueReplaceResult }): ReactNode {
  const failures = failureViews(result.localeFailures);
  if (failures.length === 0) {
    return null;
  }
  return (
    <ul
      role="alert"
      className="m-0 mb-4 list-none space-y-2 rounded-lg border-s-[3px] border-danger bg-danger-soft p-3 text-sm text-danger"
      data-replace-failures=""
    >
      {failures.map((failure) => (
        <li key={failure.locale} data-replace-failure={failure.locale} className="min-w-0">
          <span dir="ltr" className="font-mono">
            {failure.locale}
          </span>{" "}
          could not be finished ({failure.code}).
          <span className="block wrap-anywhere">{failure.message}</span>
          {failure.fileWritten ? (
            <span className="block font-medium" data-replace-file-written="">
              {FILE_WRITTEN_NOTICE}
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function OutcomeItem({ row }: { readonly row: OutcomeRow }): ReactNode {
  return (
    <div data-replace-outcome="" data-locale={row.locale}>
      <p className="m-0 flex min-w-0 flex-wrap items-center gap-2">
        <Badge verbatim>{row.locale}</Badge>
        <span dir="ltr" className="min-w-0 font-mono text-sm wrap-anywhere text-foreground">
          {row.key}
        </span>
        <Badge tone={row.view.tone} verbatim>
          {row.view.label}
        </Badge>
      </p>
      {row.view.note !== "" ? (
        <p className="m-0 mt-1 text-sm text-muted-foreground">{row.view.note}</p>
      ) : null}
      {keyedDetails(row.view.details).map((detail) => (
        <TranslationValue
          key={detail.key}
          value={detail.text}
          locale={row.locale}
          className="mt-1 block text-sm text-danger wrap-anywhere"
          data-replace-detail=""
        />
      ))}
    </div>
  );
}

function NotSentItem({ entry }: { readonly entry: ValueReplacePreviewEntry }): ReactNode {
  return (
    <div data-replace-not-sent-entry="" data-locale={entry.locale}>
      <p className="m-0 flex min-w-0 flex-wrap items-center gap-2">
        <Badge verbatim>{entry.locale}</Badge>
        <span dir="ltr" className="min-w-0 font-mono text-sm wrap-anywhere text-foreground">
          {entry.key}
        </span>
        <Badge tone={statusTone(entry.status)} verbatim>
          {STATUS_LABEL[entry.status]}
        </Badge>
      </p>
      <p className="m-0 mt-1 text-sm text-muted-foreground">{statusNote(entry.status)}</p>
    </div>
  );
}

export function ReplaceResultStep({
  result,
  notSent,
  previewedCount,
  truncated,
  onSearchAgain,
  onClose,
}: {
  readonly result: ApplyValueReplaceResult;
  readonly previewedCount: number;
  readonly notSent: readonly ValueReplacePreviewEntry[];
  readonly truncated: boolean;
  readonly onSearchAgain: () => void;
  readonly onClose: () => void;
}): ReactNode {
  const rows = outcomeRows(result.outcomes);
  const replaced = replacedCount(result.outcomes);
  return (
    <div data-replace-step="result">
      <ReplaceLead>
        <span data-replace-summary="">
          {groupedCount(replaced)} of {valueCount(rows.length)} replaced.
        </span>
        {notSent.length > 0 ? (
          <span data-replace-accounting="">
            {" "}
            The preview listed {valueCount(previewedCount)}; {groupedCount(notSent.length)}{" "}
            {notSent.length === 1 ? "was" : "were"} not sent.
          </span>
        ) : null}
      </ReplaceLead>
      {truncated ? (
        <p className="m-0 mb-3 text-sm text-warning" data-replace-truncated="">
          {TRUNCATED_NOTICE}
        </p>
      ) : null}
      <LocaleFailures result={result} />
      <ReplacePagedList
        items={rows}
        itemKey={(row) => `${row.locale}\u0000${row.key}`}
        render={(row) => <OutcomeItem row={row} />}
        listAttribute="data-replace-outcomes"
      />
      {notSent.length > 0 ? (
        <section className="mb-4" data-replace-not-sent="">
          <h3 className="m-0 mb-2 text-sm font-medium text-foreground">
            Not sent ({groupedCount(notSent.length)})
          </h3>
          <ReplacePagedList
            items={notSent}
            itemKey={(entry) => `${entry.locale}\u0000${entry.key}`}
            render={(entry) => <NotSentItem entry={entry} />}
            listAttribute="data-replace-not-sent-list"
          />
        </section>
      ) : null}
      <span className="flex flex-wrap items-center gap-3">
        <Button variant="primary" size="md" onClick={onClose} data-replace-done="">
          Done
        </Button>
        <Button size="md" onClick={onSearchAgain}>
          Search again
        </Button>
      </span>
    </div>
  );
}
