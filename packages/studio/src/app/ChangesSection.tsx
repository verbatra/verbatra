import { Badge, Button, MonoValue, PageSection } from "@verbatra/ui";
import type { ReactNode, RefObject } from "react";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import {
  type ChangeRow,
  CONFLICT_NOTICE,
  CUT_NOTICE,
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
  type GitUnavailableStatus,
  INITIAL_FILE_ROWS,
  isCutText,
  NO_KEY_DIFFERS_NOTICE,
  type OpenDiff,
  TRUNCATED_NOTICE,
  transientGitError,
  translationsHash,
  UNCHANGED_NOTICE,
  withOpenRow,
} from "../client/git-changes.js";
import type { StructuredError } from "../client/state.js";
import { ErrorMessage } from "./ErrorMessage.js";
import { Loading } from "./Loading.js";
import { cn } from "./lib/cn.js";
import { TranslationValue } from "./TranslationValue.js";

const SEE_ABOVE = "See the error above.";

const RATE_LIMITED_DETAIL =
  "Reading changes pauses briefly. Studio reads again on the next change.";

const QUIET_TEXT = "m-0 text-sm text-muted-foreground";

const LINK =
  "-ms-1.5 inline-flex min-h-8 items-center rounded-sm px-1.5 text-sm text-foreground underline-offset-2 hover:underline focus-visible:underline focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring max-md:min-h-11";

function readError(error: StructuredError, prefix?: string): ReactNode {
  return (
    <ErrorMessage
      error={error}
      {...(prefix === undefined ? {} : { prefix })}
      {...(error.code === "METHOD_RATE_LIMITED" ? { detail: RATE_LIMITED_DETAIL } : {})}
    />
  );
}

function Value({ value, locale }: { readonly value: string; readonly locale: string }): ReactNode {
  if (value === "") {
    return <span className="text-sm italic text-muted-foreground">Empty text</span>;
  }
  return (
    <>
      <TranslationValue
        value={value}
        locale={locale}
        className="block whitespace-pre-wrap wrap-anywhere text-sm"
        data-git-value=""
      />
      {isCutText(value) ? (
        <span data-git-cut="" className="block text-xs text-muted-foreground">
          {CUT_NOTICE}
        </span>
      ) : null}
    </>
  );
}

function KeyName({ name }: { readonly name: string }): ReactNode {
  return (
    <span dir="ltr" data-git-key="" className="block text-sm font-semibold wrap-anywhere">
      <MonoValue breakAnywhere>{name}</MonoValue>
      {isCutText(name) ? (
        <span data-git-cut="" className="block text-xs font-normal text-muted-foreground">
          {CUT_NOTICE}
        </span>
      ) : null}
    </span>
  );
}

function OpenLink({
  side,
  locale,
  name,
  orphaned,
}: {
  readonly side: DiffSide;
  readonly locale: string;
  readonly name: string;
  readonly orphaned: ReadonlySet<string> | undefined;
}): ReactNode {
  if (!canOpenInTranslations(side, name, orphaned)) {
    return null;
  }
  return (
    <a href={translationsHash(locale, name)} className={LINK} data-git-open="">
      Open in Translations<span className="sr-only"> for {name}</span>
    </a>
  );
}

function useReveal(
  total: number,
  initial: number,
  step: number,
): {
  readonly visible: number;
  readonly listRef: RefObject<HTMLUListElement | null>;
  readonly more: () => void;
} {
  const [shown, setShown] = useState(initial);
  const listRef = useRef<HTMLUListElement>(null);
  const focusFrom = useRef<number | null>(null);
  const visible = Math.min(shown, total);

  useEffect(() => {
    if (focusFrom.current === null) {
      return;
    }
    const rows = listRef.current?.querySelectorAll<HTMLElement>(":scope > li") ?? [];
    const target = rows[focusFrom.current] ?? rows[rows.length - 1];
    focusFrom.current = null;
    target?.focus();
  }, [shown]);

  return {
    visible,
    listRef,
    more: () => {
      focusFrom.current = visible;
      setShown(visible + step);
    },
  };
}

const FILE_ROW_CLASSES =
  "min-w-0 rounded-sm py-3 first:pt-0 last:pb-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

const ENTRY_CLASSES =
  "min-w-0 rounded-sm border-s-2 border-border ps-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

function PagedList<T>({
  label,
  items,
  render,
}: {
  readonly label: string;
  readonly items: readonly T[];
  readonly render: (item: T) => ReactNode;
}): ReactNode {
  const { visible, listRef, more } = useReveal(
    items.length,
    GIT_DIFF_PAGE_SIZE,
    GIT_DIFF_PAGE_SIZE,
  );
  if (items.length === 0) {
    return null;
  }
  const remaining = items.length - visible;
  return (
    <div data-git-group={label} className="mt-4 first:mt-0">
      <h3 className="m-0 mb-2 text-sm font-semibold text-foreground">
        {label} ({items.length})
      </h3>
      <ul ref={listRef} aria-label={label} className="m-0 flex list-none flex-col gap-3 p-0">
        {items.slice(0, visible).map((item, index) => (
          <li key={index} tabIndex={-1} data-git-entry="" className={ENTRY_CLASSES}>
            {render(item)}
          </li>
        ))}
      </ul>
      {remaining > 0 ? (
        <div className="mt-3">
          <Button size="xs" className="max-md:min-h-11" data-git-show-more="" onClick={more}>
            Show {Math.min(GIT_DIFF_PAGE_SIZE, remaining)} more of {remaining}
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
  orphaned,
}: {
  readonly diff: GitAvailableDiff;
  readonly locale: string;
  readonly orphaned: ReadonlySet<string> | undefined;
}): ReactNode {
  return (
    <>
      <PagedList
        label="Changed"
        items={diff.changed}
        render={(item) => (
          <>
            <KeyName name={item.key} />
            <div className="mt-1 grid gap-2 md:grid-cols-2">
              <LabeledValue label="Before" value={item.before} locale={locale} />
              <LabeledValue label="After" value={item.after} locale={locale} />
            </div>
            <OpenLink side="changed" locale={locale} name={item.key} orphaned={orphaned} />
          </>
        )}
      />
      <PagedList
        label="Added"
        items={diff.added}
        render={(item) => (
          <>
            <KeyName name={item.key} />
            <LabeledValue label="Value" value={item.value} locale={locale} />
            <OpenLink side="added" locale={locale} name={item.key} orphaned={orphaned} />
          </>
        )}
      />
      <PagedList
        label="Removed"
        items={diff.removed}
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
  orphaned,
}: {
  readonly diff: GitAvailableDiff;
  readonly locale: string;
  readonly orphaned: ReadonlySet<string> | undefined;
}): ReactNode {
  if (diff.state === "conflicted") {
    return <p className={QUIET_TEXT}>{CONFLICT_NOTICE}</p>;
  }
  if (diff.state === "unchanged") {
    return <p className={QUIET_TEXT}>{UNCHANGED_NOTICE}</p>;
  }
  if (diffTotal(diff) === 0) {
    return (
      <p className={QUIET_TEXT} data-git-no-key-differs="">
        {NO_KEY_DIFFERS_NOTICE}
      </p>
    );
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
      <DiffLists diff={diff} locale={locale} orphaned={orphaned} />
    </>
  );
}

function DiffBody({
  view,
  locale,
  hideCode,
  orphaned,
}: {
  readonly view: GitDiffView;
  readonly locale: string;
  readonly hideCode: string | undefined;
  readonly orphaned: ReadonlySet<string> | undefined;
}): ReactNode {
  if (view.kind === "loading") {
    return <Loading />;
  }
  if (view.kind === "error") {
    return view.error.code === hideCode ? (
      <p className={QUIET_TEXT}>Key changes are unavailable. {SEE_ABOVE}</p>
    ) : (
      readError(view.error)
    );
  }
  const staleNotice =
    view.stale && view.error.code !== hideCode
      ? readError(view.error, "Showing the last known key changes.")
      : null;
  if (!view.data.available) {
    const transient = transientGitError(view.data);
    return (
      <>
        {staleNotice}
        <p className={QUIET_TEXT} data-git-unavailable={view.data.reason}>
          {transient !== undefined && transient.code === hideCode
            ? `Key changes are unavailable. ${SEE_ABOVE}`
            : GIT_UNAVAILABLE_MESSAGES[view.data.reason]}
        </p>
      </>
    );
  }
  return (
    <>
      {staleNotice}
      <AvailableDiff diff={view.data} locale={locale} orphaned={orphaned} />
    </>
  );
}

type ToggleHandler = (target: OpenDiff, element: HTMLElement) => void;

function FileRow({
  row,
  index,
  open,
  diff,
  hideCode,
  orphaned,
  onToggle,
}: {
  readonly row: ChangeRow;
  readonly index: number;
  readonly open: OpenDiff | undefined;
  readonly diff: GitDiffView | undefined;
  readonly hideCode: string | undefined;
  readonly orphaned: ReadonlySet<string> | undefined;
  readonly onToggle: ToggleHandler;
}): ReactNode {
  const baseId = useId();
  const openLocale = row.diffLocales.find((locale) => open?.locale === locale);
  const panelShown = openLocale !== undefined && diff !== undefined;
  return (
    <li data-git-file={row.path} tabIndex={-1} className={FILE_ROW_CLASSES}>
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
                className="max-md:min-h-11"
                aria-expanded={expanded}
                {...(expanded && panelShown ? { "aria-controls": `${baseId}-${locale}` } : {})}
                data-git-toggle={locale}
                onClick={(event) =>
                  onToggle({ locale, path: row.path, position: index }, event.currentTarget)
                }
              >
                <span>
                  Key changes (
                  <span dir="ltr" className="font-mono normal-case">
                    {locale}
                  </span>
                  )
                </span>
                <span className="sr-only"> in {row.path}</span>
              </Button>
            );
          })}
        </div>
      ) : null}
      {panelShown ? (
        <div
          id={`${baseId}-${openLocale}`}
          data-git-diff={openLocale}
          className="mt-3 min-w-0 rounded-lg border border-border bg-card p-3 md:p-4"
        >
          <DiffBody view={diff} locale={openLocale} hideCode={hideCode} orphaned={orphaned} />
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
  orphaned,
  onToggle,
}: {
  readonly status: GitAvailableStatus;
  readonly open: OpenDiff | undefined;
  readonly diff: GitDiffView | undefined;
  readonly hideCode: string | undefined;
  readonly orphaned: ReadonlySet<string> | undefined;
  readonly onToggle: ToggleHandler;
}): ReactNode {
  const rows = withOpenRow(changeRows(status.files), open, diffStateOf(diff));
  const { visible, listRef, more } = useReveal(rows.length, INITIAL_FILE_ROWS, rows.length);
  const openAt = rows.findIndex(
    (row) => open !== undefined && row.diffLocales.includes(open.locale),
  );
  const shownCount = Math.max(visible, openAt + 1);
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
        <>
          <ul
            ref={listRef}
            aria-label="Changed files"
            className="m-0 list-none divide-y divide-border p-0"
          >
            {rows.slice(0, shownCount).map((row, index) => (
              <FileRow
                key={row.path}
                row={row}
                index={index}
                open={open}
                diff={diff}
                hideCode={hideCode}
                orphaned={orphaned}
                onToggle={onToggle}
              />
            ))}
          </ul>
          {shownCount < rows.length ? (
            <div className="mt-3">
              <Button size="xs" className="max-md:min-h-11" data-git-show-all="" onClick={more}>
                Show all {rows.length} files
              </Button>
            </div>
          ) : null}
        </>
      )}
    </>
  );
}

export interface ChangesSectionProps {
  readonly status: GitStatusView;
  readonly diff: GitDiffView | undefined;
  readonly open: OpenDiff | undefined;
  readonly orphaned: ReadonlySet<string> | undefined;
  readonly onToggle: (target: OpenDiff) => void;
  readonly hideCode: string | undefined;
}

function ChangesBody({
  status,
  diff,
  open,
  orphaned,
  onToggle,
  hideCode,
}: Omit<ChangesSectionProps, "onToggle"> & { readonly onToggle: ToggleHandler }): ReactNode {
  if (status.kind === "loading") {
    return <Loading />;
  }
  if (status.kind === "error") {
    return status.error.code === hideCode ? (
      <p className={QUIET_TEXT}>Changes are unavailable. {SEE_ABOVE}</p>
    ) : (
      readError(status.error)
    );
  }
  const staleNotice =
    status.stale && status.error.code !== hideCode
      ? readError(status.error, "Showing the last known changes.")
      : null;
  const { result, lastAvailable } = status.data;
  const list = result.available ? result : lastAvailable;
  return (
    <>
      {staleNotice}
      {result.available ? null : (
        <UnavailableNote result={result} kept={list !== undefined} hideCode={hideCode} />
      )}
      {list === undefined ? null : (
        <FileList
          status={list}
          open={open}
          diff={diff}
          hideCode={hideCode}
          orphaned={orphaned}
          onToggle={onToggle}
        />
      )}
    </>
  );
}

function UnavailableNote({
  result,
  kept,
  hideCode,
}: {
  readonly result: GitUnavailableStatus;
  readonly kept: boolean;
  readonly hideCode: string | undefined;
}): ReactNode {
  const transient = transientGitError(result);
  const repeated = transient !== undefined && transient.code === hideCode;
  return (
    <p className={cn(QUIET_TEXT, kept && "mb-3")} data-git-unavailable={result.reason}>
      {repeated ? `Changes are unavailable. ${SEE_ABOVE}` : GIT_UNAVAILABLE_MESSAGES[result.reason]}
      {kept ? " Showing the last known changes." : ""}
    </p>
  );
}

function toggleLocales(root: HTMLElement): string[] {
  return [...root.querySelectorAll<HTMLElement>("[data-git-toggle]")].map(
    (element) => element.getAttribute("data-git-toggle") ?? "",
  );
}

function toggleFor(root: HTMLElement, locale: string): HTMLElement | undefined {
  return [...root.querySelectorAll<HTMLElement>("[data-git-toggle]")].find(
    (element) => element.getAttribute("data-git-toggle") === locale,
  );
}

function nearestKept(
  order: readonly string[],
  lost: string,
  kept: readonly string[],
): string | undefined {
  const at = order.indexOf(lost);
  const after = order.slice(at + 1).find((locale) => kept.includes(locale));
  return (
    after ??
    order
      .slice(0, Math.max(at, 0))
      .reverse()
      .find((locale) => kept.includes(locale))
  );
}

interface HeldFocus {
  readonly element: HTMLElement;
  readonly locale: string;
}

function heldFocus(root: HTMLElement | null): HeldFocus | null {
  const active = document.activeElement;
  if (root === null || !(active instanceof HTMLElement) || !root.contains(active)) {
    return null;
  }
  const locale =
    active.closest("[data-git-toggle]")?.getAttribute("data-git-toggle") ??
    active.closest("[data-git-diff]")?.getAttribute("data-git-diff");
  return locale === undefined || locale === null ? null : { element: active, locale };
}

function focusHeading(root: HTMLElement): void {
  const heading = root.closest("section")?.querySelector<HTMLElement>("h2");
  if (heading === null || heading === undefined) {
    return;
  }
  heading.tabIndex = -1;
  heading.addEventListener("blur", () => heading.removeAttribute("tabindex"), { once: true });
  heading.focus({ preventScroll: true });
}

function isStranded(lost: HeldFocus | null): lost is HeldFocus {
  return (
    lost !== null &&
    !lost.element.isConnected &&
    (document.activeElement === document.body || document.activeElement === null)
  );
}

function handOver(
  root: HTMLElement,
  lost: HeldFocus,
  order: readonly string[],
  kept: readonly string[],
): void {
  const next = kept.includes(lost.locale) ? lost.locale : nearestKept(order, lost.locale, kept);
  const target = next === undefined ? undefined : toggleFor(root, next);
  if (target === undefined) {
    focusHeading(root);
  } else {
    target.focus({ preventScroll: true });
  }
}

function useFocusKeeper(rootRef: RefObject<HTMLDivElement | null>): void {
  const order = useRef<string[]>([]);
  const held = useRef<HeldFocus | null>(null);
  held.current = heldFocus(rootRef.current);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (root === null) {
      return;
    }
    const kept = toggleLocales(root);
    if (isStranded(held.current)) {
      handOver(root, held.current, order.current, kept);
    }
    order.current = kept;
  });
}

function useToggleAnchor(
  rootRef: RefObject<HTMLDivElement | null>,
  openLocale: string | undefined,
): (locale: string, element: HTMLElement) => void {
  const anchor = useRef<{ readonly locale: string; readonly top: number } | null>(null);

  useLayoutEffect(() => {
    const held = anchor.current;
    const root = rootRef.current;
    anchor.current = null;
    if (held === null || root === null || openLocale === undefined) {
      return;
    }
    const element = toggleFor(root, held.locale);
    const shift = element === undefined ? 0 : element.getBoundingClientRect().top - held.top;
    if (Math.abs(shift) > 1) {
      window.scrollBy(0, shift);
    }
  }, [openLocale, rootRef]);

  return (locale, element) => {
    anchor.current = { locale, top: element.getBoundingClientRect().top };
  };
}

export function ChangesSection(props: ChangesSectionProps): ReactNode {
  const rootRef = useRef<HTMLDivElement>(null);
  useFocusKeeper(rootRef);
  const remember = useToggleAnchor(rootRef, props.open?.locale);
  return (
    <PageSection title="Changes">
      <div ref={rootRef}>
        <ChangesBody
          {...props}
          onToggle={(target, element) => {
            remember(target.locale, element);
            props.onToggle(target);
          }}
        />
      </div>
    </PageSection>
  );
}
