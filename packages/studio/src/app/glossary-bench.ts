import { createContext, useContext } from "react";
import type { AddDraft, KeepDraft, TermDrafts } from "../client/glossary-drafts.js";
import type { TermDraft } from "../client/glossary-editing.js";
import type {
  GlossaryGetResult,
  GlossaryTermView,
  GlossaryWriteParams,
} from "../shared/rpc/glossary.js";
import type { RemovalRequest } from "./GlossaryRemoveDialog.js";
import type { FocusRegistry } from "./use-focus-registry.js";
import type { GlossaryWriter } from "./use-glossary-writer.js";

export interface GlossaryBench {
  readonly scope: string;
  readonly locales: readonly string[];
  readonly editable: boolean;
  readonly writer: GlossaryWriter;
  readonly focus: FocusRegistry;
  readonly editors: TermDrafts;
  readonly add: AddDraft;
  readonly keep: KeepDraft;
  setDraft(term: GlossaryTermView, draft: TermDraft): void;
  setAdd(draft: AddDraft): void;
  setKeep(draft: KeepDraft): void;
  openEditor(source: string): void;
  closeEditor(source: string): void;
  escapeEditor(source: string): void;
  readFresh(): Promise<GlossaryGetResult | undefined>;
  askRemoval(request: RemovalRequest): void;
  afterTermWrite(term: GlossaryTermView, edit: GlossaryWriteParams): void;
}

export const GlossaryBenchContext = createContext<GlossaryBench | undefined>(undefined);

export function useGlossaryBench(): GlossaryBench {
  const bench = useContext(GlossaryBenchContext);
  if (bench === undefined) {
    throw new Error("useGlossaryBench needs a GlossarySection above it");
  }
  return bench;
}

export const termKey = (source: string): string => `term:${source}`;

export const keptKey = (term: string): string => `kept:${term}`;

export const ADD_KEY = "add";

export const KEEP_KEY = "keep";

export const ADD_FIELD = "add-field";

export const SEARCH_FIELD = "search";

export const editorFieldKey = (source: string): string => `field:${source}`;
