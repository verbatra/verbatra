import { Badge, Button } from "@verbatra/ui";
import type { ReactNode } from "react";
import { Fragment, useEffect, useRef, useState } from "react";
import {
  diffKindLabel,
  emptyHistoryMessage,
  hasWordDiff,
  incompleteNotices,
  type KeyHistoryAvailable,
  type KeyHistorySegments,
  type KeyRevisionRow,
  restoreOffer,
  restoreOfferReason,
  SOURCE_CHANGED_CONFIRM,
  unavailableHistoryMessage,
} from "../client/key-history.js";
import { originBadgeView } from "../client/provenance-view.js";
import { formatTimestamp } from "../client/ui-format.js";
import { segmentValue } from "../client/value-tokens.js";
import { ErrorMessage } from "./ErrorMessage.js";
import { cn } from "./lib/cn.js";
import { TranslationValue, valueDirection } from "./TranslationValue.js";
import type { KeyHistoryRead } from "./use-key-history.js";

export interface KeyHistoryPanelProps {
  readonly keyName: string;
  readonly locale: string;
  readonly read: KeyHistoryRead;
  readonly current: string | undefined;
  readonly canWrite: boolean;
  readonly onRestore: (value: string) => void;
}

const TOUCH_TARGET = "max-md:min-h-11";

const SEGMENT_CLASSES = {
  equal: "",
  added: "rounded-sm bg-success-soft text-success underline decoration-1 underline-offset-2",
  removed: "rounded-sm bg-danger-soft text-danger line-through decoration-1",
} as const;

function DiffText({
  segments,
  locale,
}: {
  readonly segments: KeyHistorySegments;
  readonly locale: string;
}): ReactNode {
  return (
    <p
      className="m-0 whitespace-pre-wrap wrap-anywhere text-sm text-foreground"
      lang={locale}
      dir={valueDirection(locale, segments.map((segment) => segment.text).join(""))}
      data-history-diff=""
    >
      {segments.map((segment, index) => {
        const label = diffKindLabel(segment.kind);
        const parts = segmentValue(segment.text).map((part, partIndex) =>
          part.kind === "token" ? (
            <bdi key={partIndex} dir="ltr" className="wrap-anywhere" data-value-token="">
              {part.text}
            </bdi>
          ) : (
            <Fragment key={partIndex}>{part.text}</Fragment>
          ),
        );
        const key = `${index}-${segment.kind}`;
        if (segment.kind === "equal") {
          return <Fragment key={key}>{parts}</Fragment>;
        }
        const Tag = segment.kind === "added" ? "ins" : "del";
        return (
          <Tag key={key} className={SEGMENT_CLASSES[segment.kind]} data-diff-kind={segment.kind}>
            <span className="sr-only">{label}</span>
            {parts}
          </Tag>
        );
      })}
    </p>
  );
}

function DiffBlock({
  segments,
  locale,
}: {
  readonly segments: KeyHistorySegments;
  readonly locale: string;
}): ReactNode {
  if (!hasWordDiff(segments) || segments.length === 0) {
    return null;
  }
  return (
    <div className="mt-2">
      <p className="m-0 mb-1 text-xs text-muted-foreground">Changes from the previous value</p>
      <DiffText segments={segments} locale={locale} />
    </div>
  );
}

function RestoreConfirm({
  onConfirm,
  onCancel,
}: {
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}): ReactNode {
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    cancelRef.current?.focus();
  }, []);
  return (
    <fieldset
      data-restore-confirm=""
      className="m-0 mt-2 min-w-0 rounded-md border border-warning p-3"
    >
      <legend className="sr-only">Confirm restore</legend>
      <p className="m-0 mb-3 text-sm text-foreground">{SOURCE_CHANGED_CONFIRM}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="primary" className={TOUCH_TARGET} onClick={onConfirm}>
          Load as draft
        </Button>
        <Button ref={cancelRef} size="sm" className={TOUCH_TARGET} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </fieldset>
  );
}

function RevisionMeta({ revision }: { readonly revision: KeyRevisionRow }): ReactNode {
  const dateLabel = formatTimestamp(revision.authorDate);
  const origin = revision.origin === undefined ? undefined : originBadgeView(revision.origin);
  return (
    <p className="m-0 flex flex-wrap items-center gap-x-2 gap-y-1" data-revision-meta="">
      <time
        dateTime={revision.authorDate}
        className="whitespace-nowrap text-xs tabular-nums text-muted-foreground"
      >
        {dateLabel}
      </time>
      <span dir="auto" className="min-w-0 wrap-anywhere text-xs font-medium text-muted-foreground">
        {revision.author}
      </span>
      <span
        dir="ltr"
        className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground"
      >
        {revision.commit.slice(0, 7)}
      </span>
      {origin !== undefined ? (
        <span data-revision-origin={revision.origin}>
          <Badge tone={origin.tone}>
            <span className="sr-only">Origin: </span>
            {origin.label}
          </Badge>
        </span>
      ) : null}
    </p>
  );
}

function RevisionRow({
  revision,
  locale,
  current,
  canWrite,
  confirming,
  onAskRestore,
  onRestore,
  onCancel,
}: {
  readonly revision: KeyRevisionRow;
  readonly locale: string;
  readonly current: string | undefined;
  readonly canWrite: boolean;
  readonly confirming: boolean;
  readonly onAskRestore: () => void;
  readonly onRestore: () => void;
  readonly onCancel: () => void;
}): ReactNode {
  const offer = restoreOffer(revision, current, canWrite);
  const reason = restoreOfferReason(offer);
  const dateLabel = formatTimestamp(revision.authorDate);
  return (
    <li
      className="border-b border-border py-3 last:border-b-0"
      data-revision={revision.commit}
      data-source-changed={String(revision.sourceChanged)}
    >
      <RevisionMeta revision={revision} />
      <p
        dir="auto"
        data-revision-subject=""
        className="m-0 mt-1 wrap-anywhere text-sm font-medium text-foreground"
      >
        {revision.subject}
      </p>
      <TranslationValue
        as="p"
        value={revision.value}
        locale={locale}
        className="m-0 mt-2 whitespace-pre-wrap wrap-anywhere text-sm text-foreground"
        data-revision-value=""
      />
      <DiffBlock segments={revision.diff} locale={locale} />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {offer.kind === "restore" ? (
          <Button
            size="xs"
            className={TOUCH_TARGET}
            aria-label={`Restore the value from ${dateLabel}`}
            data-restore=""
            onClick={offer.needsConfirm ? onAskRestore : onRestore}
          >
            Restore
          </Button>
        ) : null}
        {reason !== undefined ? (
          <span className="text-xs text-muted-foreground" data-restore-reason={offer.kind}>
            {reason}
          </span>
        ) : null}
      </div>
      {confirming && offer.kind === "restore" ? (
        <RestoreConfirm onConfirm={onRestore} onCancel={onCancel} />
      ) : null}
    </li>
  );
}

function WorkingTreeRow({
  workingTree,
  locale,
}: {
  readonly workingTree: NonNullable<KeyHistoryAvailable["workingTree"]>;
  readonly locale: string;
}): ReactNode {
  return (
    <li className="border-b border-border py-3" data-working-tree="">
      <p className="m-0 text-sm font-medium text-foreground">Working tree (uncommitted)</p>
      <TranslationValue
        as="p"
        value={workingTree.value}
        locale={locale}
        className="m-0 mt-2 whitespace-pre-wrap wrap-anywhere text-sm text-foreground"
        data-revision-value=""
      />
      <DiffBlock segments={workingTree.diff} locale={locale} />
      {workingTree.valueRedacted === true ? (
        <p className="m-0 mt-2 text-xs text-muted-foreground">
          This value held what looks like an API key, so Studio hides it.
        </p>
      ) : null}
    </li>
  );
}

function Notices({ result }: { readonly result: KeyHistoryAvailable }): ReactNode {
  const notices = incompleteNotices(result);
  if (notices.length === 0) {
    return null;
  }
  return (
    <ul
      className="m-0 mb-3 list-none space-y-1 rounded-md border border-warning p-3 text-sm text-foreground"
      data-history-notices=""
    >
      {notices.map((notice) => (
        <li key={notice}>{notice}</li>
      ))}
    </ul>
  );
}

function AvailableHistory({
  result,
  locale,
  current,
  canWrite,
  onRestore,
}: {
  readonly result: KeyHistoryAvailable;
  readonly locale: string;
  readonly current: string | undefined;
  readonly canWrite: boolean;
  readonly onRestore: (value: string) => void;
}): ReactNode {
  const [confirming, setConfirming] = useState<string | null>(null);
  const stillListed = result.revisions.some((revision) => revision.commit === confirming);
  const empty = result.revisions.length === 0 && result.workingTree === undefined;
  return (
    <>
      <Notices result={result} />
      {empty ? (
        <p className="m-0 text-sm text-muted-foreground" data-history-empty="">
          {emptyHistoryMessage(result)}
        </p>
      ) : (
        <ol className="m-0 list-none p-0" data-history-list="">
          {result.workingTree !== undefined ? (
            <WorkingTreeRow workingTree={result.workingTree} locale={locale} />
          ) : null}
          {result.revisions.map((revision) => (
            <RevisionRow
              key={revision.commit}
              revision={revision}
              locale={locale}
              current={current}
              canWrite={canWrite}
              confirming={stillListed && confirming === revision.commit}
              onAskRestore={() => setConfirming(revision.commit)}
              onRestore={() => {
                setConfirming(null);
                onRestore(revision.value);
              }}
              onCancel={() => setConfirming(null)}
            />
          ))}
        </ol>
      )}
    </>
  );
}

export function KeyHistoryPanel({
  keyName,
  locale,
  read,
  current,
  canWrite,
  onRestore,
}: KeyHistoryPanelProps): ReactNode {
  const { view, retrying, retry } = read;
  return (
    <div data-key-history={keyName} data-history-locale={locale} className={cn("min-w-0")}>
      {view.kind === "loading" ? (
        <p className="m-0 text-sm text-muted-foreground" role="status">
          Reading the history…
        </p>
      ) : null}
      {view.kind === "error" ? (
        <ErrorMessage error={view.error} retrying={retrying} onRetry={retry} />
      ) : null}
      {view.kind === "data" && view.stale ? (
        <ErrorMessage
          error={view.error}
          prefix="The history could not be refreshed, so the last answer is shown."
          retrying={retrying}
          onRetry={retry}
        />
      ) : null}
      {view.kind === "data" && !view.data.available ? (
        <p
          className="m-0 text-sm text-muted-foreground"
          data-history-unavailable={view.data.reason}
        >
          {unavailableHistoryMessage(view.data)}
        </p>
      ) : null}
      {view.kind === "data" && view.data.available ? (
        <AvailableHistory
          result={view.data}
          locale={locale}
          current={current}
          canWrite={canWrite}
          onRestore={onRestore}
        />
      ) : null}
    </div>
  );
}
