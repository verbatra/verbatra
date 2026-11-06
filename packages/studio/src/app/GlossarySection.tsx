import { Button, EmptyState, FilterBar, SearchInput, Select } from "@verbatra/ui";
import type { ReactNode } from "react";
import { useId } from "react";
import { describeDirtyDrafts } from "../client/glossary-drafts.js";
import { ALL_LOCALES, describeFailedEdit } from "../client/glossary-editing.js";
import type {
  GlossaryGetResult,
  GlossaryIndicator,
  GlossaryWriteResult,
} from "../shared/rpc/glossary.js";
import { GlossaryAddForm } from "./GlossaryAddForm.js";
import { GlossaryDoNotTranslate } from "./GlossaryDoNotTranslate.js";
import { GlossaryRemoveDialog } from "./GlossaryRemoveDialog.js";
import { GlossaryTermRow } from "./GlossaryTermRow.js";
import { DNT_HEADING, GlossaryBenchContext, SEARCH_FIELD } from "./glossary-bench.js";
import { cn } from "./lib/cn.js";
import { UnsavedPrompt } from "./UnsavedPrompt.js";
import type { PendingHold } from "./use-glossary-hold.js";
import { type GlossaryWorkspace, useGlossaryWorkspace } from "./use-glossary-workspace.js";
import type { WriteFailure } from "./use-glossary-writer.js";

function ScopeSelect({
  locales,
  scope,
  selectRef,
  onScope,
}: {
  readonly locales: readonly string[];
  readonly scope: string;
  readonly selectRef: (element: HTMLElement | null) => void;
  readonly onScope: (next: string) => void;
}): ReactNode {
  const id = useId();
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
      <label htmlFor={id}>Show translations for</label>
      <Select
        id={id}
        ref={selectRef}
        value={scope}
        onChange={(event) => onScope(event.target.value)}
      >
        <option value={ALL_LOCALES}>All locales</option>
        {locales.map((locale) => (
          <option key={locale} value={locale}>
            {locale}
          </option>
        ))}
      </Select>
    </div>
  );
}

function emptyCopy(indicator: GlossaryIndicator): string {
  if (indicator.source === "file") {
    return "The glossary file holds no terms yet. Add the first one above to keep brand terms and fixed vocabulary consistent across locales.";
  }
  if (indicator.source === "inline") {
    return "The inline glossary in the config holds no terms.";
  }
  return "There is no glossary to show.";
}

function holdLead(pending: PendingHold | undefined): string {
  if (pending === undefined) {
    return "The glossary has changes that are not saved: ";
  }
  if (pending.kind === "close") {
    return "Closing this editor drops the changes that are not saved: ";
  }
  const where = pending.next === ALL_LOCALES ? "all locales" : pending.next;
  return `Showing ${where} drops the changes that are not saved: `;
}

function failedWhat(failure: WriteFailure | undefined): string {
  return failure === undefined
    ? "A glossary change"
    : describeFailedEdit(failure.key, failure.edit);
}

function HoldPrompt({ workspace }: { readonly workspace: GlossaryWorkspace }): ReactNode {
  const { hold, dirty, bench } = workspace;
  if (!hold.visible) {
    return null;
  }
  const closing = hold.pending?.kind === "close" ? hold.pending.source : undefined;
  const summary = describeDirtyDrafts({
    editors: closing === undefined ? dirty.editors : [closing],
    add: dirty.add && closing === undefined,
    keep: dirty.keep && hold.pending === undefined,
  });
  return (
    <div className="mb-4">
      <UnsavedPrompt
        key={workspace.promptEpoch}
        subject={
          hold.saving ? (
            "Saving the glossary. Leaving waits until the writes finish."
          ) : summary === "" ? (
            `${failedWhat(bench.writer.firstFailure())} could not be saved.`
          ) : (
            <>
              {holdLead(hold.pending)}
              <span className="wrap-anywhere">{summary}</span>.
            </>
          )
        }
        saving={hold.saving}
        error={bench.writer.firstFailure()?.error ?? null}
        placement="pane"
        onDiscard={hold.discard}
        onKeepEditing={hold.keepEditing}
      />
    </div>
  );
}

function OrphanAnnouncement({ count }: { readonly count: number }): ReactNode {
  return (
    <p aria-live="polite" className="sr-only">
      {count === 0
        ? ""
        : `${count} unsaved ${count === 1 ? "draft belongs" : "drafts belong"} to a term that no longer exists.`}
    </p>
  );
}

function TermList({
  glossary,
  workspace,
}: {
  readonly glossary: GlossaryGetResult;
  readonly workspace: GlossaryWorkspace;
}): ReactNode {
  const { rows, shown, clearSearch } = workspace;
  const count = glossary.terms.length;
  return (
    <>
      {shown.length > 0 && (glossary.doNotTranslate.length > 0 || workspace.bench.editable) ? (
        <div className="mb-2">
          <Button
            size="xs"
            variant="ghost"
            onClick={() => workspace.bench.focus.request([DNT_HEADING], { align: "top" })}
          >
            Jump to Do not translate
          </Button>
        </div>
      ) : null}
      {shown.length > 0 ? (
        <p data-term-count="" role="status" className="m-0 mb-2 text-xs text-muted-foreground">
          {workspace.matchCount === count
            ? `${count} ${count === 1 ? "term" : "terms"}`
            : `${workspace.matchCount} of ${count} terms`}
        </p>
      ) : null}
      <ul
        className={cn(
          "m-0 flex min-w-0 list-none flex-col gap-2 p-0",
          rows.length === 0 && "hidden",
        )}
      >
        {rows.map(({ term, orphan }) => (
          <GlossaryTermRow
            key={`${workspace.bench.scope}:${term.source}`}
            term={term}
            redacted={glossary.redactedTerms.includes(term.source)}
            orphaned={orphan}
          />
        ))}
      </ul>
      {workspace.capped ? (
        <div className="mt-3">
          <Button size="sm" onClick={workspace.showAll}>
            Show all {workspace.matchCount} terms
          </Button>
        </div>
      ) : null}
      {count === 0 ? (
        <EmptyState icon="glossary" title="No glossary terms">
          {emptyCopy(glossary.indicator)}
        </EmptyState>
      ) : null}
      {count > 0 && shown.length === 0 ? (
        <EmptyState
          icon="search"
          title="No terms match"
          action={
            <Button size="sm" onClick={clearSearch}>
              Clear search
            </Button>
          }
        >
          Nothing in the glossary matches this search.
        </EmptyState>
      ) : null}
    </>
  );
}

function Toolbar({
  glossary,
  workspace,
}: {
  readonly glossary: GlossaryGetResult;
  readonly workspace: GlossaryWorkspace;
}): ReactNode {
  const { bench, hold, query, setQuery } = workspace;
  if (glossary.terms.length === 0 && !bench.editable) {
    return null;
  }
  return (
    <FilterBar label="Filter terms" className="mb-4">
      <SearchInput
        ref={bench.focus.register(SEARCH_FIELD)}
        aria-label="Search terms"
        placeholder="Search terms"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {glossary.locales.length > 0 ? (
        <ScopeSelect
          locales={glossary.locales}
          scope={bench.scope}
          selectRef={bench.focus.register("scope")}
          onScope={hold.requestScope}
        />
      ) : null}
    </FilterBar>
  );
}

export function GlossarySection({
  glossary,
  onChange,
}: {
  readonly glossary: GlossaryGetResult;
  readonly onChange: (next: GlossaryWriteResult) => void;
}): ReactNode {
  const workspace = useGlossaryWorkspace({ glossary, onChange });
  const { bench, removal } = workspace;
  return (
    <GlossaryBenchContext value={bench}>
      <div>
        {workspace.readOnlyReason !== undefined ? (
          <p className="m-0 mb-3 text-sm text-muted-foreground">{workspace.readOnlyReason}</p>
        ) : null}
        <HoldPrompt workspace={workspace} />
        <Toolbar glossary={glossary} workspace={workspace} />
        {bench.editable ? (
          <GlossaryAddForm terms={glossary.terms} redactedTerms={glossary.redactedTerms} />
        ) : null}
        <OrphanAnnouncement count={workspace.orphanCount} />
        <TermList glossary={glossary} workspace={workspace} />
        {bench.editable && bench.scope !== ALL_LOCALES && glossary.terms.length > 0 ? (
          <p data-remove-reason="" className="m-0 mt-2 text-xs text-muted-foreground">
            A term is removed from All locales, where it is shared by every locale.
          </p>
        ) : null}
        <GlossaryDoNotTranslate entries={glossary.doNotTranslate} />
        {removal !== undefined ? (
          <GlossaryRemoveDialog
            request={removal}
            onConfirm={() => void workspace.confirmRemoval(removal)}
            onClose={workspace.dismissRemoval}
          />
        ) : null}
      </div>
    </GlossaryBenchContext>
  );
}
