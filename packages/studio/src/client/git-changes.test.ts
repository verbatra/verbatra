import { describe, expect, it } from "vitest";
import {
  applyGitStatus,
  canOpenInTranslations,
  changeRows,
  GIT_DIFF_MAX_VALUE_CHARS,
  GIT_UNAVAILABLE_MESSAGES,
  type GitAvailableStatus,
  type GitFile,
  type GitStatusView,
  translationsHash,
  withOpenRow,
} from "./git-changes.js";

function file(
  path: string,
  locales: readonly string[],
  state: GitFile["state"] = "modified",
): GitFile {
  return { path, locales, state };
}

const AVAILABLE: GitAvailableStatus = {
  available: true,
  branch: "main",
  files: [file("locales/de.json", ["de"])],
};

describe("changeRows", () => {
  it("offers one diff toggle per locale for a file of one locale", () => {
    expect(changeRows([file("locales/de.json", ["de"])])).toEqual([
      {
        path: "locales/de.json",
        locales: ["de"],
        state: "modified",
        diffLocales: ["de"],
        clean: false,
      },
    ]);
  });

  it("offers a toggle for each locale of a shared catalogue", () => {
    const [row] = changeRows([file("Localizable.xcstrings", ["en", "de", "fr"])]);

    expect(row?.diffLocales).toEqual(["en", "de", "fr"]);
  });

  it("offers a toggle for the lock and provenance files of no locale", () => {
    const rows = changeRows([
      file("verbatra.lock.json", []),
      file("verbatra.provenance.json", [], "untracked"),
    ]);

    expect(rows.map((row) => row.diffLocales)).toEqual([[], []]);
  });

  it("offers a locale once when a second file lists the same locale", () => {
    const rows = changeRows([
      file("de.lproj/Localizable.strings", ["de"]),
      file("de.lproj/Localizable.stringsdict", ["de"]),
    ]);

    expect(rows.map((row) => row.diffLocales)).toEqual([["de"], []]);
  });

  it("keeps hostile file names as plain data", () => {
    const hostile = "locales/<img src=x onerror=alert(1)>/‮evil‬.json";

    expect(changeRows([file(hostile, ["de"])])[0]?.path).toBe(hostile);
  });
});

describe("withOpenRow", () => {
  const rows = changeRows([file("locales/fr.json", ["fr"])]);

  it("adds nothing when nothing is open", () => {
    expect(withOpenRow(rows, undefined, undefined)).toBe(rows);
  });

  it("adds nothing while a listed row still offers the open locale", () => {
    expect(withOpenRow(rows, { locale: "fr", path: "locales/fr.json" }, undefined)).toBe(rows);
  });

  it("keeps the open file as a clean row once the status no longer lists it", () => {
    const kept = withOpenRow(rows, { locale: "de", path: "locales/de.json" }, "unchanged");

    expect(kept.map((row) => [row.path, row.clean, row.diffLocales])).toEqual([
      ["locales/fr.json", false, ["fr"]],
      ["locales/de.json", true, ["de"]],
    ]);
  });

  it("treats a diff that has not answered as clean", () => {
    expect(withOpenRow([], { locale: "de", path: "locales/de.json" }, undefined)[0]?.clean).toBe(
      true,
    );
  });

  it("shows the state a loaded diff reports for a file the status lost", () => {
    const [row] = withOpenRow([], { locale: "de", path: "locales/de.json" }, "deleted");

    expect(row).toMatchObject({ state: "deleted", clean: false });
  });
});

describe("canOpenInTranslations", () => {
  it("links an added and a changed key and never a removed one", () => {
    expect(canOpenInTranslations("added", "a.b")).toBe(true);
    expect(canOpenInTranslations("changed", "a.b")).toBe(true);
    expect(canOpenInTranslations("removed", "a.b")).toBe(false);
  });

  it("never links a key the sdk cut, nor an empty one", () => {
    expect(canOpenInTranslations("changed", "k".repeat(GIT_DIFF_MAX_VALUE_CHARS))).toBe(false);
    expect(canOpenInTranslations("changed", "k".repeat(GIT_DIFF_MAX_VALUE_CHARS - 1))).toBe(false);
    expect(canOpenInTranslations("changed", "k".repeat(GIT_DIFF_MAX_VALUE_CHARS - 2))).toBe(true);
    expect(canOpenInTranslations("changed", "")).toBe(false);
  });

  it("builds a Translations hash that keeps a hostile key as one parameter", () => {
    expect(translationsHash("de", "a&locale=fr#x?y")).toBe(
      "#/translations?locale=de&key=a%26locale%3Dfr%23x%3Fy",
    );
  });
});

describe("applyGitStatus", () => {
  const loading: GitStatusView = { kind: "loading" };

  it("remembers the last readable answer when the repository stops being readable", () => {
    const first = applyGitStatus(loading, { ok: true, result: AVAILABLE });
    const second = applyGitStatus(first, {
      ok: true,
      result: { available: false, reason: "not-a-repository" },
    });

    expect(second).toMatchObject({
      kind: "data",
      stale: false,
      data: {
        result: { available: false, reason: "not-a-repository" },
        lastAvailable: AVAILABLE,
      },
    });
  });

  it("starts with no remembered answer for a project that never was a repository", () => {
    const view = applyGitStatus(loading, {
      ok: true,
      result: { available: false, reason: "not-a-repository" },
    });

    expect(view).toMatchObject({ kind: "data", data: { lastAvailable: undefined } });
  });

  it("returns a new object for an identical answer", () => {
    const first = applyGitStatus(loading, { ok: true, result: AVAILABLE });
    const second = applyGitStatus(first, { ok: true, result: AVAILABLE });

    expect(second).not.toBe(first);
    expect(second).toEqual(first);
  });

  it("keeps the last answer with a stale error when a read fails, and an error when none exists", () => {
    const error = { code: "INTERNAL", message: "boom" };
    const first = applyGitStatus(loading, { ok: true, result: AVAILABLE });

    expect(applyGitStatus(first, { ok: false, error })).toMatchObject({
      kind: "data",
      stale: true,
      error,
      data: { lastAvailable: AVAILABLE },
    });
    expect(applyGitStatus(loading, { ok: false, error })).toEqual({ kind: "error", error });
  });
});

describe("GIT_UNAVAILABLE_MESSAGES", () => {
  it("says a project outside a repository is nothing wrong", () => {
    expect(GIT_UNAVAILABLE_MESSAGES["not-a-repository"]).toContain("Nothing is wrong");
  });
});
