import { Button, EmptyState, FilterBar, SearchInput, Select } from "@verbatra/ui";
import type { ReactNode } from "react";
import { useId } from "react";
import { describeDirtyDrafts } from "../client/glossary-drafts.js";
import { ALL_LOCALES } from "../client/glossary-editing.js";
import type {
  GlossaryGetResult,
  GlossaryIndicator,
  GlossaryTermView,
  GlossaryWriteResult,
} from "../shared/rpc/glossary.js";
import { GlossaryAddForm } from "./GlossaryAddForm.js";
import { GlossaryDoNotTranslate } from "./GlossaryDoNotTranslate.js";
import { GlossaryRemoveDialog } from "./GlossaryRemoveDialog.js";
import { GlossaryTermRow } from "./GlossaryTermRow.js";
import { GlossaryBenchContext } from "./glossary-bench.js";
import { UnsavedPrompt } from "./UnsavedPrompt.js";
import { type GlossaryWorkspace, useGlossaryWorkspace } from "./use-glossary-workspace.js";

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
    return "The glossary file holds no terms yet. Add the first one below to keep brand terms and fixed vocabulary consistent across locales.";
  }
  if (indicator.source === "inline") {
    return "The inline glossary in the config holds no terms.";
  }
  return "There is no glossary to show.";
}

function HoldPrompt({ workspace }: { readonly workspace: GlossaryWorkspace }): ReactNode {
  const { hold, dirty } = workspace;
  if (!hold.visible) {
    return null;
  }
  const lead =
    hold.pendingScope === undefined
      ? "The glossary has changes that are not saved: "
      : `Showing ${hold.pendingScope === ALL_LOCALES ? "all locales" : hold.pendingScope} drops the changes that are not saved: `;
  return (
    <div className="mb-4">
      <UnsavedPrompt
        subject={
          <>
            {lead}
            <span className="wrap-anywhere">
              {describeDirtyDrafts({
                editors: dirty.editors,
                add: dirty.add,
                keep: dirty.keep && hold.pendingScope === undefined,
              })}
            </span>
            .
          </>
        }
        saving={false}
        error={null}
        placement="pane"
        onDiscard={hold.discard}
        onKeepEditing={hold.keepEditing}
      />
    </div>
  );
}

function TermList({
  glossary,
  workspace,
}: {
  readonly glossary: GlossaryGetResult;
  readonly workspace: GlossaryWorkspace;
}): ReactNode {
  const { shown, setQuery } = workspace;
  const count = glossary.terms.length;
  if (count === 0) {
    return (
      <EmptyState icon="glossary" title="No glossary terms">
        {emptyCopy(glossary.indicator)}
      </EmptyState>
    );
  }
  if (shown.length === 0) {
    return (
      <EmptyState
        icon="search"
        title="No terms match"
        action={
          <Button size="sm" onClick={() => setQuery("")}>
            Clear search
          </Button>
        }
      >
        Nothing in the glossary matches this search.
      </EmptyState>
    );
  }
  return (
    <>
      <p role="status" className="m-0 mb-2 text-xs text-muted-foreground">
        {shown.length === count
          ? `${count} ${count === 1 ? "term" : "terms"}`
          : `${shown.length} of ${count} terms`}
      </p>
      <ul className="m-0 flex min-w-0 list-none flex-col gap-2 p-0">
        {shown.map((term: GlossaryTermView) => (
          <GlossaryTermRow
            key={`${workspace.bench.scope}:${term.source}`}
            term={term}
            redacted={glossary.redactedTerms.includes(term.source)}
          />
        ))}
      </ul>
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
  onHoldChange,
}: {
  readonly glossary: GlossaryGetResult;
  readonly onChange: (next: GlossaryWriteResult) => void;
  readonly onHoldChange?: (holding: boolean) => void;
}): ReactNode {
  const workspace = useGlossaryWorkspace({ glossary, onChange, onHoldChange });
  const { bench, removal } = workspace;
  return (
    <GlossaryBenchContext value={bench}>
      <div>
        {workspace.readOnlyReason !== undefined ? (
          <p className="m-0 mb-3 text-sm text-muted-foreground">{workspace.readOnlyReason}</p>
        ) : null}
        <HoldPrompt workspace={workspace} />
        <Toolbar glossary={glossary} workspace={workspace} />
        <TermList glossary={glossary} workspace={workspace} />
        {bench.editable && bench.scope !== ALL_LOCALES && glossary.terms.length > 0 ? (
          <p data-remove-reason="" className="m-0 mt-2 text-xs text-muted-foreground">
            A term is removed from All locales, where it is shared by every locale.
          </p>
        ) : null}
        {bench.editable ? (
          <GlossaryAddForm terms={glossary.terms} redactedTerms={glossary.redactedTerms} />
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
