import { describe, expect, it } from "vitest";
import {
  bulkDecisionBlocker,
  bulkRetranslateBlocker,
  selectedAmong,
  selectionState,
  toggleSelected,
  withAllSelected,
} from "./review-selection.js";

describe("toggleSelected", () => {
  it("adds an unselected id and removes a selected one, leaving the input untouched", () => {
    const start = new Set(["a"]);

    expect([...toggleSelected(start, "b")]).toEqual(["a", "b"]);
    expect([...toggleSelected(start, "a")]).toEqual([]);
    expect([...start]).toEqual(["a"]);
  });
});

describe("withAllSelected", () => {
  it("selects every given id and keeps a selection outside them", () => {
    expect([...withAllSelected(new Set(["z"]), ["a", "b"], true)]).toEqual(["z", "a", "b"]);
  });

  it("clears only the given ids", () => {
    expect([...withAllSelected(new Set(["a", "b", "z"]), ["a", "b"], false)]).toEqual(["z"]);
  });
});

describe("selectionState", () => {
  it.each([
    [[], "none"],
    [["a"], "some"],
    [["a", "b"], "all"],
  ] as const)("reads a selection of %j among a and b as %s", (selected, expected) => {
    expect(selectionState(["a", "b"], new Set(selected))).toBe(expected);
  });

  it("ignores a selected id that is not shown", () => {
    expect(selectionState(["a", "b"], new Set(["z"]))).toBe("none");
    expect(selectedAmong(["a", "b"], new Set(["b", "z"]))).toEqual(["b"]);
  });

  it("reads an empty list as none", () => {
    expect(selectionState([], new Set(["a"]))).toBe("none");
  });
});

describe("bulk blockers", () => {
  it("allows a decision on a loaded selection within the cap", () => {
    expect(bulkDecisionBlocker(3, 3, 100)).toBeNull();
  });

  it("names the cap when the selection is larger than a batch", () => {
    expect(bulkDecisionBlocker(101, 101, 100)).toBe(
      "Select at most 100 entries to approve or reject at once.",
    );
  });

  it("waits for values that have not loaded", () => {
    expect(bulkDecisionBlocker(3, 2, 100)).toBe(
      "Wait for the current translations to load before approving or rejecting.",
    );
  });

  it("caps a retranslation batch on its own", () => {
    expect(bulkRetranslateBlocker(20, 20)).toBeNull();
    expect(bulkRetranslateBlocker(21, 20)).toBe(
      "Select at most 20 entries to retranslate at once.",
    );
  });
});
