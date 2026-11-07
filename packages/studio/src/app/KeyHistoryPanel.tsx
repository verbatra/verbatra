import { Badge, Button, MonoValue } from "@verbatra/ui";
import type { KeyboardEvent, ReactNode } from "react";
import { Fragment, useEffect, useLayoutEffect, useRef } from "react";
import {
  type CurrentValue,
  canReadFurther,
  diffKindLabel,
  emptyHistoryMessage,
  hasWordDiff,
  incompleteNotices,
  KEY_HISTORY_DEFAULT_LIMIT,
  KEY_HISTORY_PAGE_SIZE,
  type KeyHistoryAvailable,
  type KeyHistorySegments,
  type KeyRevisionRow,
  needsSeparator,
  REDACTED_WORKING_TREE_REASON,
  restoreOffer,
  restoreOfferReason,
  SOURCE_CONFIRM_TEXT,
  type SourceConfirm,
  shownRevisions,
  unavailableHistoryMessage,
} from "../client/key-history.js";
import { originBadgeView } from "../client/provenance-view.js";
import { formatCount, formatTimestamp } from "../client/ui-format.js";
import { segmentValue } from "../client/value-tokens.js";
import { ErrorMessage } from "./ErrorMessage.js";
import { cn } from "./lib/cn.js";
import { TranslationValue, valueDirection } from "./TranslationValue.js";
import { useFocusKeeper } from "./use-focus-keeper.js";
import type { KeyHistoryRead } from "./use-key-history.js";
import type { KeyHistoryUi } from "./use-key-history-ui.js";

export interface KeyHistoryPanelProps {
  readonly keyName: string;
  readonly locale: string;
  readonly read: KeyHistoryRead;
  readonly ui: KeyHistoryUi;
  readonly current: CurrentValue;
  readonly onRestore: (revision: KeyRevisionRow) => void;
}

const TOUCH_TARGET = "max-md:min-h-11";

const FOCUS_RING =
  "focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring";

const SEGMENT_CLASSES = {
  added: "rounded-sm bg-success-soft text-success underline decoration-1 underline-offset-2",
  removed: "rounded-sm bg-danger-soft text-danger line-through decoration-1",
} as const;

function ValueParts({ text }: { readonly text: string }): ReactNode {
  return segmentValue(text).map((part, index) =>
    part.kind === "token" ? (
      <bdi key={index} dir="ltr" className="wrap-anywhere" data-value-token="">
        {part.text}
      </bdi>
    ) : (
      <Fragment key={index}>{part.text}</Fragment>
    ),
  );
}

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
        const separator = needsSeparator(segments[index - 1], segment) ? " " : "";
        if (segment.kind === "equal") {
          return (
            <Fragment key={index}>
              <bdi data-diff-kind="equal">
                <ValueParts text={segment.text} />
              </bdi>
            </Fragment>
          );
        }
        const Tag = segment.kind === "added" ? "ins" : "del";
        return (
          <Fragment key={index}>
            {separator}
            <Tag className={SEGMENT_CLASSES[segment.kind]} data-diff-kind={segment.kind}>
              <span className="sr-only">{diffKindLabel(segment.kind)}</span>
              <bdi>
                <ValueParts text={segment.text} />
              </bdi>
            </Tag>
          </Fragment>
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
  if (!hasWordDiff(segments)) {
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
  commit,
  confirm,
  onConfirm,
  onCancel,
}: {
  readonly commit: string;
  readonly confirm: SourceConfirm;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}): ReactNode {
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    cancelRef.current?.focus();
  }, []);
  function onKeyDown(event: KeyboardEvent<HTMLFieldSetElement>): void {
    if (event.key === "Escape" && !event.nativeEvent.isComposing) {
      event.stopPropagation();
      event.preventDefault();
      onCancel();
    }
  }
  return (
    <fieldset
      data-restore-confirm={confirm}
      onKeyDown={onKeyDown}
      className="m-0 mt-2 min-w-0 rounded-lg border border-warning p-3"
    >
      <legend className="sr-only">Confirm restore</legend>
      <p className="m-0 mb-3 text-sm text-foreground">{SOURCE_CONFIRM_TEXT[confirm]}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="primary"
          className={TOUCH_TARGET}
          data-focus-id={`confirm-load:${commit}`}
          onClick={onConfirm}
        >
          Load as draft
        </Button>
        <Button
          ref={cancelRef}
          size="sm"
          className={TOUCH_TARGET}
          data-focus-id={`confirm-cancel:${commit}`}
          onClick={onCancel}
        >
          Cancel
        </Button>
      </div>
    </fieldset>
  );
}

function RevisionMeta({
  revision,
  dateLabel,
}: {
  readonly revision: KeyRevisionRow;
  readonly dateLabel: string;
}): ReactNode {
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
      <span dir="ltr" className="rounded-sm bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
        <MonoValue>{revision.commit.slice(0, 7)}</MonoValue>
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
  confirming,
  onAskRestore,
  onRestore,
  onCancel,
}: {
  readonly revision: KeyRevisionRow;
  readonly locale: string;
  readonly current: CurrentValue;
  readonly confirming: boolean;
  readonly onAskRestore: () => void;
  readonly onRestore: () => void;
  readonly onCancel: () => void;
}): ReactNode {
  const restoreRef = useRef<HTMLButtonElement | null>(null);
  const offer = restoreOffer(revision, current);
  const reason = restoreOfferReason(offer);
  const dateLabel = formatTimestamp(revision.authorDate);
  return (
    <li
      tabIndex={-1}
      className={cn("border-b border-border py-3 last:border-b-0", FOCUS_RING)}
      data-revision={revision.commit}
      data-source-changed={String(revision.sourceChanged)}
    >
      <RevisionMeta revision={revision} dateLabel={dateLabel} />
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
            ref={restoreRef}
            size="xs"
            className={TOUCH_TARGET}
            aria-label={`Restore the value from ${dateLabel} (${revision.commit.slice(0, 7)})`}
            data-restore=""
            data-focus-id={`restore:${revision.commit}`}
            onClick={offer.confirm === null ? onRestore : onAskRestore}
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
      {confirming && offer.kind === "restore" && offer.confirm !== null ? (
        <RestoreConfirm
          commit={revision.commit}
          confirm={offer.confirm}
          onConfirm={onRestore}
          onCancel={() => {
            onCancel();
            restoreRef.current?.focus();
          }}
        />
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
        <p className="m-0 mt-2 text-xs text-muted-foreground">{REDACTED_WORKING_TREE_REASON}</p>
      ) : null}
    </li>
  );
}

function ReadFurther({
  pending,
  onClick,
}: {
  readonly pending: boolean;
  readonly onClick: () => void;
}): ReactNode {
  return (
    <Button
      size="xs"
      className={cn("mt-2", TOUCH_TARGET)}
      aria-disabled={pending || undefined}
      aria-busy={pending || undefined}
      data-read-further=""
      onClick={pending ? undefined : onClick}
    >
      {pending ? "Reading further back…" : "Read further back"}
    </Button>
  );
}

function Notices({
  result,
  ui,
  pending,
}: {
  readonly result: KeyHistoryAvailable;
  readonly ui: KeyHistoryUi;
  readonly pending: boolean;
}): ReactNode {
  const requested = ui.limit ?? KEY_HISTORY_DEFAULT_LIMIT;
  const notices = incompleteNotices(result, requested);
  if (notices.length === 0) {
    return null;
  }
  return (
    <div className="mb-3 rounded-lg border border-warning p-3" data-history-notices="">
      <ul className="m-0 list-none space-y-1 p-0 text-sm text-foreground">
        {notices.map((notice) => (
          <li key={notice}>{notice}</li>
        ))}
      </ul>
      {canReadFurther(result, requested) ? (
        <ReadFurther pending={pending} onClick={ui.readFurther} />
      ) : null}
    </div>
  );
}

function RevisionList({
  result,
  locale,
  current,
  ui,
  onRestore,
}: {
  readonly result: KeyHistoryAvailable;
  readonly locale: string;
  readonly current: CurrentValue;
  readonly ui: KeyHistoryUi;
  readonly onRestore: (revision: KeyRevisionRow) => void;
}): ReactNode {
  const latest = useRef(result);
  latest.current = result;
  const listRef = useRef<HTMLOListElement | null>(null);
  const focusAfterMore = useRef<number | null>(null);
  const visible = shownRevisions(result.revisions, ui.shown);
  const hidden = result.revisions.length - visible.length;
  const stillListed = visible.some((revision) => revision.commit === ui.confirming);

  useEffect(() => {
    if (ui.confirming !== null && !stillListed) {
      ui.confirm(null);
    }
  }, [ui, stillListed]);

  useLayoutEffect(() => {
    const index = focusAfterMore.current;
    focusAfterMore.current = null;
    if (index !== null) {
      listRef.current?.querySelectorAll<HTMLElement>("[data-revision]")[index]?.focus();
    }
  });

  function newest(commit: string): KeyRevisionRow | undefined {
    return latest.current.revisions.find((revision) => revision.commit === commit);
  }

  function restore(commit: string): void {
    const revision = newest(commit);
    if (revision !== undefined) {
      ui.confirm(null);
      onRestore(revision);
    }
  }

  function ask(commit: string): void {
    const revision = newest(commit);
    if (revision === undefined) {
      return;
    }
    const offer = restoreOffer(revision, current);
    if (offer.kind === "restore" && offer.confirm === null) {
      restore(commit);
    } else {
      ui.confirm(commit);
    }
  }

  return (
    <>
      <ol ref={listRef} className="m-0 list-none p-0" data-history-list="">
        {result.workingTree !== undefined ? (
          <WorkingTreeRow workingTree={result.workingTree} locale={locale} />
        ) : null}
        {visible.map((revision) => (
          <RevisionRow
            key={revision.commit}
            revision={revision}
            locale={locale}
            current={current}
            confirming={ui.confirming === revision.commit}
            onAskRestore={() => ask(revision.commit)}
            onRestore={() => restore(revision.commit)}
            onCancel={() => ui.confirm(null)}
          />
        ))}
      </ol>
      {hidden > 0 ? (
        <Button
          size="xs"
          className={cn("mt-2", TOUCH_TARGET)}
          data-history-show-more=""
          onClick={() => {
            focusAfterMore.current = visible.length;
            ui.showMore();
          }}
        >
          {`Show ${formatCount(Math.min(hidden, KEY_HISTORY_PAGE_SIZE))} more`}
        </Button>
      ) : null}
    </>
  );
}

function AvailableHistory({
  result,
  locale,
  current,
  ui,
  pending,
  onRestore,
}: {
  readonly result: KeyHistoryAvailable;
  readonly locale: string;
  readonly current: CurrentValue;
  readonly ui: KeyHistoryUi;
  readonly pending: boolean;
  readonly onRestore: (revision: KeyRevisionRow) => void;
}): ReactNode {
  const empty = result.revisions.length === 0 && result.workingTree === undefined;
  return (
    <>
      <Notices result={result} ui={ui} pending={pending} />
      {empty ? (
        <p className="m-0 text-sm text-muted-foreground" data-history-empty="">
          {emptyHistoryMessage(result)}
        </p>
      ) : (
        <RevisionList
          result={result}
          locale={locale}
          current={current}
          ui={ui}
          onRestore={onRestore}
        />
      )}
    </>
  );
}

const RECOVERY_RING =
  "scroll-mt-28 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring";

function revisionOf(element: Element | null): string | undefined {
  return element?.closest("[data-revision]")?.getAttribute("data-revision") ?? undefined;
}

export function KeyHistoryPanel({
  keyName,
  locale,
  read,
  ui,
  current,
  onRestore,
}: KeyHistoryPanelProps): ReactNode {
  const { view, retrying, pending, retry } = read;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const heightRef = useRef(0);
  const armed = useRef(false);

  useFocusKeeper(rootRef, {
    items: (root) =>
      [...root.querySelectorAll("[data-revision]")].map(
        (element) => element.getAttribute("data-revision") as string,
      ),
    itemOf: (active) =>
      active.closest("[data-read-further]") !== null ? "read-further" : revisionOf(active),
    find: (root, item) => {
      const row = [...root.querySelectorAll<HTMLElement>("[data-revision]")].find(
        (element) => element.getAttribute("data-revision") === item,
      );
      return row?.querySelector<HTMLElement>("[data-restore]") ?? row;
    },
    fallback: (root) => root.focus({ preventScroll: true }),
  });

  useLayoutEffect(() => {
    if (view.kind === "data" && rootRef.current !== null) {
      heightRef.current = rootRef.current.offsetHeight;
    }
  });

  useEffect(() => {
    if (retrying || !armed.current) {
      return;
    }
    armed.current = false;
    const root = rootRef.current;
    const active = document.activeElement;
    if (
      view.kind === "data" &&
      !view.stale &&
      root !== null &&
      (active === document.body || root.contains(active))
    ) {
      root.focus();
    }
  }, [retrying, view]);

  function doRetry(): void {
    armed.current = true;
    retry();
  }

  const reserved = view.kind === "loading" && heightRef.current > 0 ? heightRef.current : undefined;
  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      data-key-history={keyName}
      data-history-locale={locale}
      data-recovery-target="key-history"
      className={cn("min-w-0", RECOVERY_RING)}
      style={reserved === undefined ? undefined : { minHeight: reserved }}
    >
      {view.kind === "loading" ? (
        <p className="m-0 text-sm text-muted-foreground" role="status">
          Reading the history…
        </p>
      ) : null}
      {view.kind === "error" ? (
        <ErrorMessage error={view.error} retrying={retrying} onRetry={doRetry} />
      ) : null}
      {view.kind === "data" && view.stale ? (
        <ErrorMessage
          error={view.error}
          prefix="The history could not be refreshed, so the last answer is shown."
          retrying={retrying}
          onRetry={doRetry}
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
          ui={ui}
          pending={pending}
          onRestore={onRestore}
        />
      ) : null}
    </div>
  );
}
