import { describe, expect, it } from "vitest";
import type { GlossaryTermView } from "../shared/rpc/glossary.js";
import {
  describeDirtyDrafts,
  dirtyEditorSources,
  EMPTY_ADD_DRAFT,
  EMPTY_KEEP_DRAFT,
  editorTerm,
  isAddDirty,
  isKeepDirty,
  orphanedSources,
} from "./glossary-drafts.js";
import { ALL_LOCALES, draftFor } from "./glossary-editing.js";

function term(source: string): GlossaryTermView {
  return { source, target: "x", targets: {}, forbidden: {}, caseSensitive: false, byLocale: {} };
}

describe("isAddDirty", () => {
  it("is clean for the empty form and for whitespace only", () => {
    expect(isAddDirty(EMPTY_ADD_DRAFT)).toBe(false);
    expect(isAddDirty({ term: "  ", translation: "\n" })).toBe(false);
  });

  it("is dirty once either half holds text", () => {
    expect(isAddDirty({ term: "a", translation: "" })).toBe(true);
    expect(isAddDirty({ term: "", translation: "b" })).toBe(true);
  });
});

describe("isKeepDirty", () => {
  it("ignores the case toggle and looks at the term", () => {
    expect(isKeepDirty({ ...EMPTY_KEEP_DRAFT, caseSensitive: false })).toBe(false);
    expect(isKeepDirty({ term: "Northwind", caseSensitive: true })).toBe(true);
  });
});

describe("dirtyEditorSources", () => {
  const [a, b] = [term("a"), term("b")] as [GlossaryTermView, GlossaryTermView];

  it("lists only open editors whose draft differs from where they started", () => {
    const editors = new Map([
      ["a", { draft: draftFor(a, ALL_LOCALES), base: a }],
      ["b", { draft: { ...draftFor(b, ALL_LOCALES), translation: "changed" }, base: b }],
    ]);

    expect(dirtyEditorSources(editors, ALL_LOCALES)).toEqual(["b"]);
  });

  it("is empty with no drafts", () => {
    expect(dirtyEditorSources(new Map(), ALL_LOCALES)).toEqual([]);
  });

  it("measures a draft against where it started, so an outside change leaves it clean", () => {
    const editors = new Map([["a", { draft: draftFor(a, ALL_LOCALES), base: a }]]);

    expect(dirtyEditorSources(editors, ALL_LOCALES)).toEqual([]);
  });

  it("finds orphans among the open editors", () => {
    const gone = term("gone");
    const editors = new Map([["gone", { draft: draftFor(gone, ALL_LOCALES), base: gone }]]);

    expect(orphanedSources([a, b], editors)).toEqual(["gone"]);
    expect(editorTerm([a, b], "gone", editors.get("gone") as never)).toBe(gone);
  });

  it.each(["constructor", "toString", "__proto__"])(
    "keeps a term named %s like any other",
    (name) => {
      const odd = term(name);
      const editors = new Map([[name, { draft: draftFor(odd, ALL_LOCALES), base: odd }]]);

      expect(editors.get(name)?.base).toBe(odd);
      expect(editorTerm([odd], name, editors.get(name) as never)).toBe(odd);
      expect(orphanedSources([odd], editors)).toEqual([]);
      expect(dirtyEditorSources(editors, ALL_LOCALES)).toEqual([]);
    },
  );
});

describe("describeDirtyDrafts", () => {
  it("names each dirty source", () => {
    expect(describeDirtyDrafts({ editors: ["a"], add: true, keep: true })).toBe(
      'the edit of "a", the new term, the new do-not-translate term',
    );
  });

  it("collapses the tail past three", () => {
    expect(
      describeDirtyDrafts({ editors: ["a", "b", "c", "d", "e"], add: true, keep: false }),
    ).toBe('the edit of "a", the edit of "b", the edit of "c" and 3 more');
  });
});
