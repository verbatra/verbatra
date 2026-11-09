import type { ApplyValueReplaceResult } from "@verbatra/sdk";
import { Badge, Button } from "@verbatra/ui";
import type { ReactNode } from "react";
import { useState } from "react";
import {
  FILE_WRITTEN_NOTICE,
  failureViews,
  outcomeRows,
  replacedCount,
  valueCount,
} from "../client/value-replace.js";

const PAGE_SIZE = 50;

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

export function ReplaceResultStep({
  result,
  onSearchAgain,
  onClose,
}: {
  readonly result: ApplyValueReplaceResult;
  readonly onSearchAgain: () => void;
  readonly onClose: () => void;
}): ReactNode {
  const [shown, setShown] = useState(PAGE_SIZE);
  const rows = outcomeRows(result.outcomes);
  const replaced = replacedCount(result.outcomes);
  return (
    <div data-replace-step="result">
      <p className="m-0 mb-3 text-sm text-foreground" role="status" data-replace-summary="">
        {replaced} of {valueCount(rows.length)} replaced.
      </p>
      <LocaleFailures result={result} />
      <ul className="m-0 mb-4 list-none space-y-2 p-0" data-replace-outcomes="">
        {rows.slice(0, shown).map((row) => (
          <li
            key={`${row.locale}\u0000${row.key}`}
            className="min-w-0 rounded-lg border border-border p-3"
            data-replace-outcome=""
            data-locale={row.locale}
          >
            <p className="m-0 flex min-w-0 flex-wrap items-center gap-2">
              <Badge verbatim>{row.locale}</Badge>
              <span dir="ltr" className="min-w-0 font-mono text-sm wrap-anywhere text-foreground">
                {row.key}
              </span>
              <Badge tone={row.view.tone} wrap verbatim>
                {row.view.label}
              </Badge>
            </p>
            {row.view.details.map((detail) => (
              <p key={detail} className="m-0 mt-1 text-sm text-danger wrap-anywhere">
                {detail}
              </p>
            ))}
          </li>
        ))}
      </ul>
      {shown < rows.length ? (
        <Button size="sm" className="mb-4" onClick={() => setShown(shown + PAGE_SIZE)}>
          Show {Math.min(PAGE_SIZE, rows.length - shown)} more
        </Button>
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
