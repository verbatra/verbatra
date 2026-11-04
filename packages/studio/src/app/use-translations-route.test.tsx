import { describe, expect, it } from "vitest";
import type { DiffLocale } from "../client/diff-view.js";
import { knownLocalesOf } from "./use-translations-route.js";

const DE: DiffLocale = {
  locale: "de",
  missing: [],
  changed: [],
  orphaned: [],
  hasPendingChanges: false,
};

describe("knownLocalesOf", () => {
  it("lists the locales of a loaded diff", () => {
    expect(knownLocalesOf({ kind: "loaded", hasPendingChanges: false, locales: [DE] })).toEqual([
      "de",
    ]);
  });

  it("knows nothing while the diff loads, so a locale in the address is kept", () => {
    expect(knownLocalesOf({ kind: "loading" })).toBeNull();
  });

  it("knows nothing after a failed first read either, so a transient error never drops the locale", () => {
    expect(
      knownLocalesOf({ kind: "error", error: { code: "INTERNAL", message: "gone" } }),
    ).toBeNull();
  });
});
