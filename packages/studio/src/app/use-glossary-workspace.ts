import { useEffect, useMemo, useRef, useState } from "react";
import {
  dirtyEditorSources,
  type EditorEntry,
  EMPTY_ADD_DRAFT,
  EMPTY_KEEP_DRAFT,
  isAddDirty,
  isKeepDirty,
  orphanedSources,
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
import { rpcClient } from "./api.js";
import type { RemovalRequest } from "./GlossaryRemoveDialog.js";
import {
  ADD_FIELD,
  ADD_KEY,
  editorFieldKey,
  type GlossaryBench,
  KEEP_KEY,
  keptKey,
  SEARCH_FIELD,
  termKey,
} from "./glossary-bench.js";
import { useFocusRegistry } from "./use-focus-registry.js";
import { type GlossaryHold, useGlossaryHold } from "./use-glossary-hold.js";
import { useGlossaryWriter } from "./use-glossary-writer.js";

export const LIST_CAP = 50;

export interface GlossaryWorkspace {
  readonly bench: GlossaryBench;
  readonly hold: GlossaryHold;
  readonly readOnlyReason: string | undefined;
  readonly shown: readonly GlossaryTermView[];
  readonly orphanTerms: readonly GlossaryTermView[];
  readonly matchCount: number;
  readonly capped: boolean;
  readonly showAll: () => void;
  readonly query: string;
  readonly setQuery: (next: string) => void;
  readonly clearSearch: () => void;
  readonly removal: RemovalRequest | undefined;
  readonly dismissRemoval: () => void;
  readonly confirmRemoval: (request: RemovalRequest) => Promise<void>;
  readonly promptEpoch: number;
  readonly dirty: {
    readonly editors: readonly string[];
    readonly add: boolean;
    readonly keep: boolean;
  };
}

function withEntry(
  editors: TermDrafts,
  source: string,
  entry: EditorEntry | undefined,
): TermDrafts {
  const next = new Map(editors);
  if (entry === undefined) {
    next.delete(source);
  } else {
    next.set(source, entry);
  }
  return next;
}

function focusKeysAfterRemoval(
  visible: readonly GlossaryTermView[],
  editors: TermDrafts,
  removed: string,
): readonly string[] {
  const next = nextFocusSource(
    visible.map((term) => term.source),
    removed,
  );
  if (next === undefined) {
    return [ADD_FIELD];
  }
  return [termKey(next), ...(editors.has(next) ? [editorFieldKey(next)] : []), ADD_FIELD];
}

export function useGlossaryWorkspace({
  glossary,
  onChange,
}: {
  readonly glossary: GlossaryGetResult;
  readonly onChange: (next: GlossaryWriteResult) => void;
}): GlossaryWorkspace {
  const writer = useGlossaryWriter(onChange);
  const focus = useFocusRegistry();
  const [editors, setEditors] = useState<TermDrafts>(new Map());
  const [add, setAddState] = useState(EMPTY_ADD_DRAFT);
  const [keep, setKeepState] = useState(EMPTY_KEEP_DRAFT);
  const [scope, setScope] = useState<string>(ALL_LOCALES);
  const [query, setQueryState] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [addChecking, setAddChecking] = useState(false);
  const [removal, setRemoval] = useState<RemovalRequest | undefined>(undefined);
  const [promptEpoch, setPromptEpoch] = useState(0);
  const removalRef = useRef(removal);
  removalRef.current = removal;
  const readOnlyReason = glossaryReadOnlyReason(glossary.indicator);
  const { terms } = glossary;

  const matching = useMemo(() => new Set(filterTerms(terms, query)), [terms, query]);
  const wanted = terms.filter((term) => matching.has(term) || editors.has(term.source));
  const capped = !expanded && wanted.length > LIST_CAP;
  const listed = capped
    ? wanted.filter((term, index) => index < LIST_CAP || editors.has(term.source))
    : wanted;
  const orphanSources = orphanedSources(terms, editors);
  const orphanTerms = orphanSources.flatMap((source) => {
    const entry = editors.get(source);
    return entry === undefined ? [] : [entry.base];
  });
  const orphanRef = useRef<ReadonlySet<string>>(new Set());
  orphanRef.current = new Set(orphanSources);
  const dirtySources = dirtyEditorSources(editors, scope);
  const addDirty = isAddDirty(add);
  const keepDirty = isKeepDirty(keep);
  const dirtyScoped = dirtySources.length > 0 || addDirty;

  function setQuery(next: string): void {
    setQueryState(next);
    setExpanded(false);
  }

  function discardAll(): void {
    setEditors(new Map());
    setAddState(EMPTY_ADD_DRAFT);
    setKeepState(EMPTY_KEEP_DRAFT);
    writer.dismissDrafts();
  }

  function applyScope(next: string): void {
    setEditors(new Map());
    setAddState(EMPTY_ADD_DRAFT);
    setScope(next);
    setExpanded(false);
    writer.dismissDrafts();
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

  function closeEditor(source: string): void {
    setEditors((current) => withEntry(current, source, undefined));
    writer.dismiss(termKey(source));
    focus.request([termKey(source), SEARCH_FIELD, ADD_FIELD]);
  }

  function focusSource(source: string): void {
    focus.request([editorFieldKey(source)]);
  }

  const hold = useGlossaryHold({
    dirtyAll: dirtyScoped || keepDirty,
    dirtyScoped,
    saving: writer.anyBusy || addChecking,
    failed: writer.firstFailure() !== undefined,
    isSourceDirty: (source) => dirtySources.includes(source),
    discardAll,
    discardSource: closeEditor,
    applyScope,
    focusDirty,
    focusSource,
    currentScope: scope,
  });

  useEffect(() => {
    if (hold.visible && removalRef.current !== undefined) {
      setRemoval(undefined);
      setPromptEpoch((epoch) => epoch + 1);
    }
  }, [hold.visible]);

  function setDraft(term: GlossaryTermView, draft: TermDraft): void {
    setEditors((current) =>
      withEntry(current, term.source, { draft, base: current.get(term.source)?.base ?? term }),
    );
    writer.dismiss(termKey(term.source));
  }

  function focusMayMove(source: string): boolean {
    const active = document.activeElement;
    if (active === null || active === document.body) {
      return true;
    }
    if (active.closest("[role=dialog]") !== null) {
      return true;
    }
    return active.closest("[data-glossary-row]")?.getAttribute("data-glossary-row") === source;
  }

  function afterTermWrite(term: GlossaryTermView, edit: GlossaryWriteParams): void {
    setEditors((current) => withEntry(current, term.source, undefined));
    if (!focusMayMove(term.source)) {
      return;
    }
    if (editEmptiesTerm(term, edit)) {
      focus.request(focusKeysAfterRemoval(listed, editors, term.source));
    } else {
      focus.request([termKey(term.source), SEARCH_FIELD, ADD_FIELD]);
    }
  }

  function openEditor(source: string): void {
    const term = terms.find((candidate) => candidate.source === source);
    if (term === undefined) {
      return;
    }
    if (editors.has(source)) {
      focus.request([editorFieldKey(source)]);
      return;
    }
    setEditors((current) =>
      withEntry(current, source, { draft: draftFor(term, scope), base: term }),
    );
    writer.dismiss(termKey(source));
  }

  async function confirmKept(request: Extract<RemovalRequest, { kind: "kept" }>): Promise<void> {
    const entries = glossary.doNotTranslate.map((entry) => entry.term);
    const next = nextFocusSource(entries, request.entry.term);
    await writer.write(keptKey(request.entry.term), request.edit, {
      onDone: () => focus.request([...(next === undefined ? [] : [keptKey(next)]), KEEP_KEY]),
    });
  }

  async function confirmRemoval(request: RemovalRequest): Promise<void> {
    if (request.kind === "kept") {
      await confirmKept(request);
    } else {
      await writer.write(termKey(request.term.source), request.edit, {
        onDone: () => afterTermWrite(request.term, request.edit),
        stillWanted: () => !orphanRef.current.has(request.term.source),
      });
    }
    setRemoval(undefined);
  }

  async function readFresh(): Promise<GlossaryGetResult | undefined> {
    const response = await rpcClient.call("glossary.get", {});
    if (!response.ok) {
      return undefined;
    }
    onChange(response.result);
    return response.result;
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
    setDraft,
    setAdd: (draft) => {
      setAddState(draft);
      writer.dismiss(ADD_KEY);
    },
    setKeep: (draft) => {
      setKeepState(draft);
      writer.dismiss(KEEP_KEY);
    },
    openEditor,
    closeEditor,
    escapeEditor: hold.requestClose,
    isOrphan: (source) => orphanRef.current.has(source),
    addChecking,
    setAddChecking,
    askRemoval: setRemoval,
    afterTermWrite,
    readFresh,
  };

  return {
    bench,
    hold,
    readOnlyReason,
    shown: listed,
    orphanTerms,
    matchCount: wanted.length,
    capped,
    showAll: () => {
      setExpanded(true);
      const first = wanted[LIST_CAP];
      if (first !== undefined) {
        focus.request([termKey(first.source), SEARCH_FIELD]);
      }
    },
    query,
    setQuery,
    clearSearch: () => {
      setQuery("");
      focus.request([SEARCH_FIELD]);
    },
    removal,
    dismissRemoval: () => setRemoval(undefined),
    confirmRemoval,
    promptEpoch,
    dirty: { editors: dirtySources, add: addDirty, keep: keepDirty },
  };
}
