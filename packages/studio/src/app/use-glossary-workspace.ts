import { useEffect, useMemo, useState } from "react";
import {
  dirtyEditorSources,
  EMPTY_ADD_DRAFT,
  EMPTY_KEEP_DRAFT,
  isAddDirty,
  isKeepDirty,
  type TermDrafts,
} from "../client/glossary-drafts.js";
import {
  ALL_LOCALES,
  draftFor,
  editEmptiesTerm,
  filterTerms,
  glossaryReadOnlyReason,
  nextFocusSource,
  type TermDraft,
} from "../client/glossary-editing.js";
import type {
  GlossaryGetResult,
  GlossaryTermView,
  GlossaryWriteParams,
  GlossaryWriteResult,
} from "../shared/rpc/glossary.js";
import type { RemovalRequest } from "./GlossaryRemoveDialog.js";
import {
  ADD_FIELD,
  editorFieldKey,
  type GlossaryBench,
  KEEP_KEY,
  keptKey,
  termKey,
} from "./glossary-bench.js";
import { useFocusRegistry } from "./use-focus-registry.js";
import { type GlossaryHold, useGlossaryHold } from "./use-glossary-hold.js";
import { useGlossaryWriter } from "./use-glossary-writer.js";

export interface GlossaryWorkspace {
  readonly bench: GlossaryBench;
  readonly hold: GlossaryHold;
  readonly readOnlyReason: string | undefined;
  readonly shown: readonly GlossaryTermView[];
  readonly query: string;
  readonly setQuery: (next: string) => void;
  readonly removal: RemovalRequest | undefined;
  readonly dismissRemoval: () => void;
  readonly confirmRemoval: (request: RemovalRequest) => Promise<void>;
  readonly dirty: {
    readonly editors: readonly string[];
    readonly add: boolean;
    readonly keep: boolean;
  };
}

function useTermDrafts(): {
  readonly editors: TermDrafts;
  readonly setEditor: (source: string, draft: TermDraft | undefined) => void;
  readonly clearEditors: () => void;
} {
  const [editors, setEditors] = useState<TermDrafts>({});
  return {
    editors,
    setEditor: (source, draft) =>
      setEditors((current) => {
        const { [source]: _dropped, ...rest } = current;
        return draft === undefined ? rest : { ...rest, [source]: draft };
      }),
    clearEditors: () => setEditors({}),
  };
}

export function useGlossaryWorkspace({
  glossary,
  onChange,
  onHoldChange,
}: {
  readonly glossary: GlossaryGetResult;
  readonly onChange: (next: GlossaryWriteResult) => void;
  readonly onHoldChange: ((holding: boolean) => void) | undefined;
}): GlossaryWorkspace {
  const writer = useGlossaryWriter(onChange);
  const focus = useFocusRegistry();
  const { editors, setEditor, clearEditors } = useTermDrafts();
  const [add, setAdd] = useState(EMPTY_ADD_DRAFT);
  const [keep, setKeep] = useState(EMPTY_KEEP_DRAFT);
  const [scope, setScope] = useState<string>(ALL_LOCALES);
  const [query, setQuery] = useState("");
  const [removal, setRemoval] = useState<RemovalRequest | undefined>(undefined);
  const readOnlyReason = glossaryReadOnlyReason(glossary.indicator);
  const { terms } = glossary;

  const matching = useMemo(() => new Set(filterTerms(terms, query)), [terms, query]);
  const shown = terms.filter((term) => matching.has(term) || editors[term.source] !== undefined);
  const dirtySources = dirtyEditorSources(terms, scope, editors);
  const addDirty = isAddDirty(add);
  const keepDirty = isKeepDirty(keep);
  const dirtyScoped = dirtySources.length > 0 || addDirty;
  const holding = Object.keys(editors).length > 0 || addDirty || keepDirty || removal !== undefined;

  useEffect(() => {
    onHoldChange?.(holding);
  }, [holding, onHoldChange]);

  function discardAll(): void {
    clearEditors();
    setAdd(EMPTY_ADD_DRAFT);
    setKeep(EMPTY_KEEP_DRAFT);
  }

  function applyScope(next: string): void {
    clearEditors();
    setAdd(EMPTY_ADD_DRAFT);
    setScope(next);
    focus.request(["scope"]);
  }

  function focusDirty(): void {
    const first = dirtySources[0];
    if (first !== undefined) {
      focus.request([editorFieldKey(first)]);
    } else {
      focus.request([addDirty ? ADD_FIELD : KEEP_KEY]);
    }
  }

  const hold = useGlossaryHold({
    dirtyAll: dirtyScoped || keepDirty,
    dirtyScoped,
    discardAll,
    applyScope,
    focusDirty,
    currentScope: scope,
  });

  function afterTermWrite(term: GlossaryTermView, edit: GlossaryWriteParams): void {
    setEditor(term.source, undefined);
    if (!editEmptiesTerm(term, edit)) {
      focus.request([termKey(term.source)]);
      return;
    }
    const next = nextFocusSource(
      shown.map((candidate) => candidate.source),
      term.source,
    );
    focus.request([...(next === undefined ? [] : [termKey(next)]), ADD_FIELD]);
  }

  function openEditor(source: string): void {
    const term = terms.find((candidate) => candidate.source === source);
    if (term === undefined) {
      return;
    }
    if (editors[source] === undefined) {
      setEditor(source, draftFor(term, scope));
    } else {
      focus.request([editorFieldKey(source)]);
    }
  }

  function closeEditor(source: string): void {
    setEditor(source, undefined);
    writer.dismiss(termKey(source));
    focus.request([termKey(source)]);
  }

  async function confirmKept(request: Extract<RemovalRequest, { kind: "kept" }>): Promise<void> {
    const entries = glossary.doNotTranslate.map((entry) => entry.term);
    const next = nextFocusSource(entries, request.entry.term);
    if (await writer.write(keptKey(request.entry.term), request.edit)) {
      focus.request([...(next === undefined ? [] : [keptKey(next)]), KEEP_KEY]);
    }
  }

  async function confirmRemoval(request: RemovalRequest): Promise<void> {
    if (request.kind === "kept") {
      await confirmKept(request);
    } else if (await writer.write(termKey(request.term.source), request.edit)) {
      afterTermWrite(request.term, request.edit);
    }
    setRemoval(undefined);
  }

  const bench: GlossaryBench = {
    scope,
    locales: glossary.locales,
    editable: readOnlyReason === undefined,
    writer,
    focus,
    editors,
    add,
    keep,
    setEditor,
    setAdd,
    setKeep,
    openEditor,
    closeEditor,
    askRemoval: setRemoval,
    afterTermWrite,
  };

  return {
    bench,
    hold,
    readOnlyReason,
    shown,
    query,
    setQuery,
    removal,
    dismissRemoval: () => setRemoval(undefined),
    confirmRemoval,
    dirty: { editors: dirtySources, add: addDirty, keep: keepDirty },
  };
}
