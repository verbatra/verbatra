import { Badge, Button, MonoValue, PageSection } from "@verbatra/ui";
import type { ReactNode } from "react";
import { useEffect, useId, useRef, useState } from "react";
import {
  type ChangeRow,
  CONFLICT_NOTICE,
  canOpenInTranslations,
  changeRows,
  type DiffSide,
  diffSummary,
  diffTotal,
  GIT_DIFF_PAGE_SIZE,
  GIT_STATE_LABELS,
  GIT_STATE_TONES,
  GIT_UNAVAILABLE_MESSAGES,
  type GitAvailableDiff,
  type GitAvailableStatus,
  type GitDiffView,
  type GitStatusView,
  type OpenDiff,
  TRUNCATED_NOTICE,
  translationsHash,
  UNCHANGED_NOTICE,
  withOpenRow,
} from "../client/git-changes.js";
import { ErrorMessage } from "./ErrorMessage.js";
import { Loading } from "./Loading.js";
import { cn } from "./lib/cn.js";
import { TranslationValue } from "./TranslationValue.js";

const SEE_ABOVE = "See the error above.";

const QUIET_TEXT = "m-0 text-sm text-muted-foreground";

const LINK =
  "inline-flex min-h-8 items-center rounded-sm px-1.5 text-sm text-foreground underline-offset-2 hover:underline focus-visible:underline focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring max-md:min-h-11";

function Value({ value, locale }: { readonly value: string; readonly locale: string }): ReactNode {
  if (value === "") {
    return <span className="text-sm italic text-muted-foreground">Empty text</span>;
  }
  return (
    <TranslationValue
      value={value}
      locale={locale}
      className="block whitespace-pre-wrap wrap-anywhere text-sm"
      data-git-value=""
    />
  );
}

function KeyName({ name }: { readonly name: string }): ReactNode {
  return (
    <span dir="ltr" data-git-key="" className="block text-sm font-semibold wrap-anywhere">
      <MonoValue breakAnywhere>{name}</MonoValue>
    </span>
  );
}

function OpenLink({
  side,
  locale,
  name,
}: {
  readonly side: DiffSide;
  readonly locale: string;
  readonly name: string;
}): ReactNode {
  if (!canOpenInTranslations(side, name)) {
    return null;
  }
  return (
    <a href={translationsHash(locale, name)} className={LINK} data-git-open="">
      Open in Translations<span className="sr-only"> for {name}</span>
    </a>
  );
}

function PagedList<T>({
  label,
  items,
  render,
  rowKey,
}: {
  readonly label: string;
  readonly items: readonly T[];
  readonly render: (item: T) => ReactNode;
  readonly rowKey: (item: T) => string;
}): ReactNode {
  const [shown, setShown] = useState(GIT_DIFF_PAGE_SIZE);
  const listRef = useRef<HTMLUListElement>(null);
  const focusFrom = useRef<number | null>(null);

  useEffect(() => {
    if (focusFrom.current === null) {
      return;
    }
    const rows = listRef.current?.querySelectorAll<HTMLElement>(":scope > li") ?? [];
    const target = rows[focusFrom.current] ?? rows[rows.length - 1];
    focusFrom.current = null;
    target?.focus();
  }, [shown]);

  if (items.length === 0) {
    return null;
  }
  const visible = items.slice(0, shown);
  return (
    <div data-git-group={label} className="mt-4 first:mt-0">
      <h4 className="m-0 mb-2 text-sm font-semibold text-foreground">
        {label} ({items.length})
      </h4>
      <ul ref={listRef} aria-label={label} className="m-0 flex list-none flex-col gap-3 p-0">
        {visible.map((item) => (
          <li
            key={rowKey(item)}
            tabIndex={-1}
            data-git-entry=""
            className="min-w-0 rounded-sm border-s-2 border-border ps-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {render(item)}
          </li>
        ))}
      </ul>
      {items.length > visible.length ? (
        <div className="mt-3">
          <Button
            size="xs"
            data-git-show-more=""
            onClick={() => {
              focusFrom.current = visible.length;
              setShown((count) => count + GIT_DIFF_PAGE_SIZE);
            }}
          >
            Show {Math.min(GIT_DIFF_PAGE_SIZE, items.length - visible.length)} more of{" "}
            {items.length - visible.length}
            <span className="sr-only"> {label.toLowerCase()}</span>
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function LabeledValue({
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
      <span className="block text-xs font-medium text-muted-foreground">{label}</span>
      <Value value={value} locale={locale} />
    </div>
  );
}

function DiffLists({
  diff,
  locale,
}: {
  readonly diff: GitAvailableDiff;
  readonly locale: string;
}): ReactNode {
  return (
    <>
      <PagedList
        label="Changed"
        items={diff.changed}
        rowKey={(item) => item.key}
        render={(item) => (
          <>
            <KeyName name={item.key} />
            <div className="mt-1 grid gap-2 md:grid-cols-2">
              <LabeledValue label="Before" value={item.before} locale={locale} />
              <LabeledValue label="After" value={item.after} locale={locale} />
            </div>
            <OpenLink side="changed" locale={locale} name={item.key} />
          </>
        )}
      />
      <PagedList
        label="Added"
        items={diff.added}
        rowKey={(item) => item.key}
        render={(item) => (
          <>
            <KeyName name={item.key} />
            <LabeledValue label="Value" value={item.value} locale={locale} />
            <OpenLink side="added" locale={locale} name={item.key} />
          </>
        )}
      />
      <PagedList
        label="Removed"
        items={diff.removed}
        rowKey={(item) => item.key}
        render={(item) => (
          <>
            <KeyName name={item.key} />
            <LabeledValue label="Value at the last commit" value={item.value} locale={locale} />
          </>
        )}
      />
    </>
  );
}

function AvailableDiff({
  diff,
  locale,
}: {
  readonly diff: GitAvailableDiff;
  readonly locale: string;
}): ReactNode {
  if (diff.state === "conflicted") {
    return <p className={QUIET_TEXT}>{CONFLICT_NOTICE}</p>;
  }
  if (diff.state === "unchanged" && diffTotal(diff) === 0) {
    return <p className={QUIET_TEXT}>{UNCHANGED_NOTICE}</p>;
  }
  return (
    <>
      <p className={cn(QUIET_TEXT, "mb-3")} data-git-summary="">
        {diffSummary(diff)}
      </p>
      {diff.truncated ? (
        <p className={cn(QUIET_TEXT, "mb-3")} data-git-truncated="">
          {TRUNCATED_NOTICE}
        </p>
      ) : null}
      <DiffLists diff={diff} locale={locale} />
    </>
  );
}

function DiffBody({
  view,
  locale,
  hideCode,
}: {
  readonly view: GitDiffView;
  readonly locale: string;
  readonly hideCode: string | undefined;
}): ReactNode {
  if (view.kind === "loading") {
    return <Loading />;
  }
  if (view.kind === "error") {
    return view.error.code === hideCode ? (
      <p className={QUIET_TEXT}>Key changes are unavailable. {SEE_ABOVE}</p>
    ) : (
      <ErrorMessage error={view.error} />
    );
  }
  const staleNotice =
    view.stale && view.error.code !== hideCode ? (
      <ErrorMessage error={view.error} prefix="Showing the last known key changes." />
    ) : null;
  if (!view.data.available) {
    return (
      <>
        {staleNotice}
        <p className={QUIET_TEXT} data-git-unavailable={view.data.reason}>
          {GIT_UNAVAILABLE_MESSAGES[view.data.reason]}
        </p>
      </>
    );
  }
  return (
    <>
      {staleNotice}
      <AvailableDiff diff={view.data} locale={locale} />
    </>
  );
}

function FileRow({
  row,
  open,
  diff,
  hideCode,
  onToggle,
}: {
  readonly row: ChangeRow;
  readonly open: OpenDiff | undefined;
  readonly diff: GitDiffView | undefined;
  readonly hideCode: string | undefined;
  readonly onToggle: (target: OpenDiff) => void;
}): ReactNode {
  const baseId = useId();
  const openLocale = row.diffLocales.find((locale) => open?.locale === locale);
  return (
    <li data-git-file={row.path} className="min-w-0 py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        {row.clean ? (
          <Badge tone="unchanged">Matches last commit</Badge>
        ) : (
          <Badge tone={GIT_STATE_TONES[row.state]}>{GIT_STATE_LABELS[row.state]}</Badge>
        )}
        <span
          dir="auto"
          data-git-path=""
          className="min-w-0 flex-1 basis-48 font-mono text-sm wrap-anywhere"
        >
          {row.path}
        </span>
      </div>
      {row.diffLocales.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {row.diffLocales.map((locale) => {
            const expanded = openLocale === locale;
            return (
              <Button
                key={locale}
                size="xs"
                aria-expanded={expanded}
                aria-controls={`${baseId}-${locale}`}
                data-git-toggle={locale}
                onClick={() => onToggle({ locale, path: row.path })}
              >
                Key changes (
                <span dir="ltr" className="font-mono normal-case">
                  {locale}
                </span>
                )<span className="sr-only"> in {row.path}</span>
              </Button>
            );
          })}
        </div>
      ) : null}
      {openLocale !== undefined && diff !== undefined ? (
        <div
          id={`${baseId}-${openLocale}`}
          data-git-diff={openLocale}
          className="mt-3 min-w-0 rounded-lg border border-border bg-card p-3 md:p-4"
        >
          <DiffBody view={diff} locale={openLocale} hideCode={hideCode} />
        </div>
      ) : null}
    </li>
  );
}

function diffStateOf(diff: GitDiffView | undefined): GitAvailableDiff["state"] | undefined {
  if (diff?.kind !== "data" || !diff.data.available) {
    return undefined;
  }
  return diff.data.state;
}

function FileList({
  status,
  open,
  diff,
  hideCode,
  onToggle,
}: {
  readonly status: GitAvailableStatus;
  readonly open: OpenDiff | undefined;
  readonly diff: GitDiffView | undefined;
  readonly hideCode: string | undefined;
  readonly onToggle: (target: OpenDiff) => void;
}): ReactNode {
  const rows = withOpenRow(changeRows(status.files), open, diffStateOf(diff));
  return (
    <>
      <p className={cn(QUIET_TEXT, "mb-3")} data-git-branch="">
        {status.branch === null ? (
          "Detached HEAD"
        ) : (
          <>
            Branch{" "}
            <span dir="auto" className="font-mono text-foreground wrap-anywhere">
              {status.branch}
            </span>
          </>
        )}
      </p>
      {rows.length === 0 ? (
        <p className={QUIET_TEXT} data-git-clean="">
          No locale file differs from the last commit.
        </p>
      ) : (
        <ul aria-label="Changed files" className="m-0 list-none divide-y divide-border p-0">
          {rows.map((row) => (
            <FileRow
              key={row.path}
              row={row}
              open={open}
              diff={diff}
              hideCode={hideCode}
              onToggle={onToggle}
            />
          ))}
        </ul>
      )}
    </>
  );
}

export interface ChangesSectionProps {
  readonly status: GitStatusView;
  readonly diff: GitDiffView | undefined;
  readonly open: OpenDiff | undefined;
  readonly onToggle: (target: OpenDiff) => void;
  readonly hideCode: string | undefined;
}

function ChangesBody({ status, diff, open, onToggle, hideCode }: ChangesSectionProps): ReactNode {
  if (status.kind === "loading") {
    return <Loading />;
  }
  if (status.kind === "error") {
    return status.error.code === hideCode ? (
      <p className={QUIET_TEXT}>Changes are unavailable. {SEE_ABOVE}</p>
    ) : (
      <ErrorMessage error={status.error} />
    );
  }
  const staleNotice =
    status.stale && status.error.code !== hideCode ? (
      <ErrorMessage error={status.error} prefix="Showing the last known changes." />
    ) : null;
  const { result, lastAvailable } = status.data;
  const list = result.available ? result : lastAvailable;
  return (
    <>
      {staleNotice}
      {result.available ? null : (
        <p
          className={cn(QUIET_TEXT, list === undefined ? "" : "mb-3")}
          data-git-unavailable={result.reason}
        >
          {GIT_UNAVAILABLE_MESSAGES[result.reason]}
          {list === undefined ? "" : " Showing the last known changes."}
        </p>
      )}
      {list === undefined ? null : (
        <FileList status={list} open={open} diff={diff} hideCode={hideCode} onToggle={onToggle} />
      )}
    </>
  );
}

export function ChangesSection(props: ChangesSectionProps): ReactNode {
  return (
    <PageSection title="Changes">
      <ChangesBody {...props} />
    </PageSection>
  );
}
