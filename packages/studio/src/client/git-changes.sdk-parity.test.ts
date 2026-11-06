import {
  LOCALE_GIT_DIFF_MAX_ENTRIES,
  LOCALE_GIT_DIFF_MAX_VALUE_CHARS,
  LOCALE_GIT_FILE_STATES,
  LOCALE_GIT_UNAVAILABLE_REASONS,
} from "@verbatra/sdk";
import { describe, expect, it } from "vitest";
import {
  GIT_DIFF_MAX_ENTRIES,
  GIT_DIFF_MAX_VALUE_CHARS,
  GIT_STATE_LABELS,
  GIT_STATE_TONES,
  GIT_UNAVAILABLE_MESSAGES,
} from "./git-changes.js";

describe("git changes against the sdk", () => {
  it("states the same caps the sdk applies to a diff", () => {
    expect(GIT_DIFF_MAX_ENTRIES).toBe(LOCALE_GIT_DIFF_MAX_ENTRIES);
    expect(GIT_DIFF_MAX_VALUE_CHARS).toBe(LOCALE_GIT_DIFF_MAX_VALUE_CHARS);
  });

  it("words every reason the sdk can give, and no other", () => {
    expect(Object.keys(GIT_UNAVAILABLE_MESSAGES).sort()).toEqual(
      [...LOCALE_GIT_UNAVAILABLE_REASONS].sort(),
    );
    for (const message of Object.values(GIT_UNAVAILABLE_MESSAGES)) {
      expect(message.trim()).not.toBe("");
    }
  });

  it("labels and tones every file state the sdk can give, and no other", () => {
    expect(Object.keys(GIT_STATE_LABELS).sort()).toEqual([...LOCALE_GIT_FILE_STATES].sort());
    expect(Object.keys(GIT_STATE_TONES).sort()).toEqual([...LOCALE_GIT_FILE_STATES].sort());
  });
});
