import { describe, expect, it } from "vitest";
import {
  type DraftState,
  draftIdentity,
  EMPTY_DRAFT,
  isDraftDirty,
  reconcileDraft,
} from "./draft-state.js";

const DE_TITLE = draftIdentity("de", "app.title");
const DE_BODY = draftIdentity("de", "app.body");

function draft(identity: string | null, baseline: string, text: string): DraftState {
  return { identity, baseline, text };
}

describe("draftIdentity", () => {
  it("names one locale of one key, and nothing while no locale is edited", () => {
    expect(draftIdentity(null, "app.title")).toBeNull();
    expect(draftIdentity("de", "app.title")).not.toBe(draftIdentity("fr", "app.title"));
    expect(draftIdentity("de", "app.title")).not.toBe(draftIdentity("de", "app.body"));
  });

  it("cannot confuse a locale and key that concatenate to the same text", () => {
    expect(draftIdentity("a", "bc")).not.toBe(draftIdentity("ab", "c"));
  });
});

describe("isDraftDirty", () => {
  it("is dirty only when the text differs from the saved value", () => {
    expect(isDraftDirty(draft(DE_TITLE, "Hallo", "Hallo"))).toBe(false);
    expect(isDraftDirty(draft(DE_TITLE, "Hallo", "Hallo!"))).toBe(true);
  });
});

describe("reconcileDraft", () => {
  it("waits while the saved value is still loading", () => {
    expect(reconcileDraft(EMPTY_DRAFT, DE_TITLE, null)).toBe(EMPTY_DRAFT);
  });

  it("stays empty while no locale is edited", () => {
    expect(reconcileDraft(EMPTY_DRAFT, null, "Hallo")).toBe(EMPTY_DRAFT);
  });

  it("drops the draft once the entry is no longer edited, so reopening starts clean", () => {
    expect(reconcileDraft(draft(DE_TITLE, "Hallo", "Hallo!"), null, null)).toBe(EMPTY_DRAFT);
  });

  it("starts from the saved value of a newly chosen entry", () => {
    expect(reconcileDraft(EMPTY_DRAFT, DE_TITLE, "Hallo")).toEqual(
      draft(DE_TITLE, "Hallo", "Hallo"),
    );
  });

  it("returns the same state when nothing changed", () => {
    const state = draft(DE_TITLE, "Hallo", "Hallo!");
    expect(reconcileDraft(state, DE_TITLE, "Hallo")).toBe(state);
  });

  it("resets a clean draft when the saved value changes", () => {
    expect(reconcileDraft(draft(DE_TITLE, "Hallo", "Hallo"), DE_TITLE, "Servus")).toEqual(
      draft(DE_TITLE, "Servus", "Servus"),
    );
  });

  it("keeps a dirty draft when the saved value changes, and judges it against the new value", () => {
    const next = reconcileDraft(draft(DE_TITLE, "Hallo", "Hallo!"), DE_TITLE, "Servus");
    expect(next).toEqual(draft(DE_TITLE, "Servus", "Hallo!"));
    expect(isDraftDirty(next)).toBe(true);
  });

  it("turns clean when the saved value catches up with the draft", () => {
    const next = reconcileDraft(draft(DE_TITLE, "Hallo", "Hallo!"), DE_TITLE, "Hallo!");
    expect(isDraftDirty(next)).toBe(false);
  });

  it("resets when another entry is chosen", () => {
    expect(reconcileDraft(draft(DE_TITLE, "Hallo", "Hallo!"), DE_BODY, "Text")).toEqual(
      draft(DE_BODY, "Text", "Text"),
    );
  });

  it("starts a new entry from the seed, dirty against the saved value", () => {
    const next = reconcileDraft(EMPTY_DRAFT, DE_TITLE, "Hallo", "Servus");

    expect(next).toEqual(draft(DE_TITLE, "Hallo", "Servus"));
    expect(isDraftDirty(next)).toBe(true);
  });

  it("applies the seed once: a later saved value keeps the edit and ignores the seed", () => {
    const seeded = reconcileDraft(EMPTY_DRAFT, DE_TITLE, "Hallo", "Servus");

    expect(reconcileDraft(seeded, DE_TITLE, "Moin", "Servus")).toEqual(
      draft(DE_TITLE, "Moin", "Servus"),
    );
  });

  it("waits for the saved value before seeding", () => {
    expect(reconcileDraft(EMPTY_DRAFT, DE_TITLE, null, "Servus")).toBe(EMPTY_DRAFT);
  });
});
