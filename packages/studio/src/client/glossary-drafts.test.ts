import { describe, expect, it } from "vitest";
import type { GlossaryTermView } from "../shared/rpc/glossary.js";
import {
  describeDirtyDrafts,
  dirtyEditorSources,
  EMPTY_ADD_DRAFT,
  EMPTY_KEEP_DRAFT,
  isAddDirty,
  isKeepDirty,
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
  const terms = [term("a"), term("b"), term("c")];

  it("lists only open editors whose draft differs from the term", () => {
    const drafts = {
      a: draftFor(terms[0] as GlossaryTermView, ALL_LOCALES),
      b: { ...draftFor(terms[1] as GlossaryTermView, ALL_LOCALES), translation: "changed" },
    };

    expect(dirtyEditorSources(terms, ALL_LOCALES, drafts)).toEqual(["b"]);
  });

  it("is empty with no drafts", () => {
    expect(dirtyEditorSources(terms, ALL_LOCALES, {})).toEqual([]);
  });
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
