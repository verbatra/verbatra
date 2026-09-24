import { describe, expect, it } from "vitest";
import {
  clampIndex,
  classifyShortcutTarget,
  keyCap,
  REVIEW_SHORTCUTS,
  resolveReviewShortcut,
  type ShortcutKeyEvent,
  shortcutKeysFor,
  stepIndex,
  visibleShortcuts,
} from "./review-shortcuts.js";

function keyEvent(key: string, overrides: Partial<ShortcutKeyEvent> = {}): ShortcutKeyEvent {
  return { key, ctrlKey: false, metaKey: false, altKey: false, target: "other", ...overrides };
}

describe("resolveReviewShortcut: key map", () => {
  it.each([
    ["j", "next"],
    ["ArrowDown", "next"],
    ["k", "previous"],
    ["ArrowUp", "previous"],
    ["a", "approve"],
    ["r", "reject"],
    ["e", "edit"],
    ["Enter", "edit"],
    ["t", "retranslate"],
    ["?", "help"],
  ] as const)("maps %s to %s", (key, action) => {
    expect(resolveReviewShortcut(keyEvent(key))).toBe(action);
  });

  it("ignores a key with no shortcut", () => {
    expect(resolveReviewShortcut(keyEvent("z"))).toBeNull();
  });

  it("treats an upper-case letter as a different key", () => {
    expect(resolveReviewShortcut(keyEvent("A"))).toBeNull();
  });
});

describe("resolveReviewShortcut: guards", () => {
  it.each([
    ["ctrlKey", { ctrlKey: true }],
    ["metaKey", { metaKey: true }],
    ["altKey", { altKey: true }],
  ] as const)("ignores a key pressed with %s", (_name, overrides) => {
    expect(resolveReviewShortcut(keyEvent("a", overrides))).toBeNull();
  });

  it("ignores every key while typing in an editable field", () => {
    expect(resolveReviewShortcut(keyEvent("j", { target: "editable" }))).toBeNull();
  });

  it("leaves Enter to a focused control so it activates that control", () => {
    expect(resolveReviewShortcut(keyEvent("Enter", { target: "control" }))).toBeNull();
  });

  it("still resolves a letter while a control has focus", () => {
    expect(resolveReviewShortcut(keyEvent("a", { target: "control" }))).toBe("approve");
  });
});

describe("classifyShortcutTarget", () => {
  function element(tagName: string, type = "", isContentEditable = false) {
    return { tagName, type, isContentEditable };
  }

  it.each([
    ["INPUT", "editable"],
    ["TEXTAREA", "editable"],
    ["SELECT", "editable"],
    ["BUTTON", "control"],
    ["A", "control"],
    ["SUMMARY", "control"],
    ["TR", "other"],
    ["tr", "other"],
  ] as const)("classifies a %s as %s", (tag, expected) => {
    expect(classifyShortcutTarget(element(tag))).toBe(expected);
  });

  it.each(["checkbox", "radio", "CHECKBOX"])(
    "classifies a %s input as a control rather than a text field",
    (type) => {
      expect(classifyShortcutTarget(element("INPUT", type))).toBe("control");
    },
  );

  it("classifies a text input as editable", () => {
    expect(classifyShortcutTarget(element("INPUT", "text"))).toBe("editable");
  });

  it("classifies a contenteditable element as editable", () => {
    expect(classifyShortcutTarget(element("DIV", "", true))).toBe("editable");
  });

  it("classifies a missing element as other", () => {
    expect(classifyShortcutTarget(null)).toBe("other");
  });
});

describe("shortcut listing", () => {
  it("names every key of an action for aria-keyshortcuts", () => {
    expect(shortcutKeysFor("next")).toBe("j ArrowDown");
    expect(shortcutKeysFor("approve")).toBe("a");
  });

  it("leaves retranslate out without spend", () => {
    expect(visibleShortcuts(false).map((shortcut) => shortcut.action)).not.toContain("retranslate");
    expect(visibleShortcuts(true)).toHaveLength(REVIEW_SHORTCUTS.length);
  });
});

describe("row index arithmetic", () => {
  it("steps forward and backward without wrapping", () => {
    expect(stepIndex(0, 1, 3)).toBe(1);
    expect(stepIndex(2, 1, 3)).toBe(2);
    expect(stepIndex(0, -1, 3)).toBe(0);
  });

  it("clamps an index that fell off the end after rows were removed", () => {
    expect(clampIndex(5, 3)).toBe(2);
    expect(clampIndex(-1, 3)).toBe(0);
  });

  it("answers 0 for an empty list", () => {
    expect(clampIndex(4, 0)).toBe(0);
    expect(stepIndex(0, 1, 0)).toBe(0);
  });
});

describe("keyCap", () => {
  it("draws arrow keys as glyphs and names them for screen readers", () => {
    expect(keyCap("ArrowDown")).toEqual({ glyph: "↓", name: "Down arrow" });
    expect(keyCap("ArrowUp")).toEqual({ glyph: "↑", name: "Up arrow" });
    expect(keyCap("Enter")).toEqual({ glyph: "Enter", name: "Enter" });
  });

  it("shows a character key as itself", () => {
    expect(keyCap("a")).toEqual({ glyph: "a", name: "a" });
  });
});
