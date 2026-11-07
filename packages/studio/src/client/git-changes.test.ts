import { describe, expect, it } from "vitest";
import {
  applyGitStatus,
  canOpenInTranslations,
  changeRows,
  diffSummary,
  GIT_DIFF_MAX_ENTRIES,
  GIT_DIFF_MAX_VALUE_CHARS,
  GIT_UNAVAILABLE_MESSAGES,
  type GitAvailableDiff,
  type GitAvailableStatus,
  type GitFile,
  type GitStatusView,
  isCutText,
  transientGitError,
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

const DIFF: GitAvailableDiff = {
  available: true,
  path: "locales/de.json",
  state: "modified",
  added: [],
  removed: [],
  changed: [],
  truncated: false,
};

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
    expect(
      withOpenRow(rows, { locale: "fr", path: "locales/fr.json", position: 0 }, undefined),
    ).toBe(rows);
  });

  it("keeps the open file as a clean row once the status no longer lists it", () => {
    const kept = withOpenRow(
      rows,
      { locale: "de", path: "locales/de.json", position: 1 },
      "unchanged",
    );

    expect(kept.map((row) => [row.path, row.clean, row.diffLocales])).toEqual([
      ["locales/fr.json", false, ["fr"]],
      ["locales/de.json", true, ["de"]],
    ]);
  });

  it("treats a diff that has not answered as clean", () => {
    expect(
      withOpenRow([], { locale: "de", path: "locales/de.json", position: 1 }, undefined)[0]?.clean,
    ).toBe(true);
  });

  it("shows the state a loaded diff reports for a file the status lost", () => {
    const [row] = withOpenRow(
      [],
      { locale: "de", path: "locales/de.json", position: 1 },
      "deleted",
    );

    expect(row).toMatchObject({ state: "deleted", clean: false });
  });
});

const NONE: ReadonlySet<string> = new Set();

describe("canOpenInTranslations", () => {
  it("never links a key the source does not have, nor any key while the orphans are unknown", () => {
    expect(canOpenInTranslations("added", "stray", new Set(["stray"]))).toBe(false);
    expect(canOpenInTranslations("changed", "stray", new Set(["stray"]))).toBe(false);
    expect(canOpenInTranslations("added", "kept", new Set(["stray"]))).toBe(true);
    expect(canOpenInTranslations("added", "kept", undefined)).toBe(false);
  });

  it("links an added and a changed key and never a removed one", () => {
    expect(canOpenInTranslations("added", "a.b", NONE)).toBe(true);
    expect(canOpenInTranslations("changed", "a.b", NONE)).toBe(true);
    expect(canOpenInTranslations("removed", "a.b", NONE)).toBe(false);
  });

  it("never links a key the sdk cut, nor an empty one", () => {
    expect(canOpenInTranslations("changed", "k".repeat(GIT_DIFF_MAX_VALUE_CHARS), NONE)).toBe(
      false,
    );
    expect(canOpenInTranslations("changed", "k".repeat(GIT_DIFF_MAX_VALUE_CHARS - 1), NONE)).toBe(
      false,
    );
    expect(canOpenInTranslations("changed", "k".repeat(GIT_DIFF_MAX_VALUE_CHARS - 2), NONE)).toBe(
      true,
    );
    expect(canOpenInTranslations("changed", "", NONE)).toBe(false);
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

describe("withOpenRow position", () => {
  const rows = changeRows([
    file("locales/a.json", ["fr"]),
    file("locales/b.json", ["es"]),
    file("locales/c.json", ["it"]),
  ]);

  it("puts the kept row where it was, not at the end", () => {
    const kept = withOpenRow(
      rows,
      { locale: "de", path: "locales/de.json", position: 1 },
      "unchanged",
    );

    expect(kept.map((row) => row.path)).toEqual([
      "locales/a.json",
      "locales/de.json",
      "locales/b.json",
      "locales/c.json",
    ]);
  });

  it("clamps a position beyond the list to the end and below zero to the start", () => {
    const end = withOpenRow(rows, { locale: "de", path: "x", position: 99 }, "unchanged");
    const start = withOpenRow(rows, { locale: "de", path: "x", position: -4 }, "unchanged");

    expect(end.at(-1)?.path).toBe("x");
    expect(start[0]?.path).toBe("x");
  });
});

describe("isCutText", () => {
  it("marks a text at the sdk cut and not a shorter one", () => {
    expect(isCutText("x".repeat(GIT_DIFF_MAX_VALUE_CHARS))).toBe(true);
    expect(isCutText("x".repeat(GIT_DIFF_MAX_VALUE_CHARS - 1))).toBe(true);
    expect(isCutText("x".repeat(GIT_DIFF_MAX_VALUE_CHARS - 2))).toBe(false);
    expect(isCutText("")).toBe(false);
  });
});

describe("diffSummary", () => {
  const entry = { key: "k", value: "v" };

  it("counts a complete list exactly", () => {
    expect(diffSummary({ ...DIFF, added: [entry], changed: [], removed: [entry, entry] })).toBe(
      "0 changed, 1 added, 2 removed",
    );
  });

  it("says at least when the entry cap was reached, never an exact count", () => {
    const changed = Array.from({ length: GIT_DIFF_MAX_ENTRIES }, () => ({
      key: "k",
      before: "a",
      after: "b",
    }));

    expect(diffSummary({ ...DIFF, changed })).toBe(
      `${GIT_DIFF_MAX_ENTRIES}+ keys differ; listed: ${GIT_DIFF_MAX_ENTRIES} changed, 0 added, 0 removed`,
    );
  });
});

describe("transientGitError", () => {
  it.each([
    ["timeout", "GIT_TIMEOUT"],
    ["git-failed", "GIT_GIT_FAILED"],
  ] as const)("turns %s into an error the page can retry", (reason, code) => {
    expect(transientGitError({ available: false, reason })).toEqual({
      code,
      message: GIT_UNAVAILABLE_MESSAGES[reason],
    });
  });

  it.each([
    "not-a-repository",
    "git-missing",
    "dubious-ownership",
    "custom-adapter",
    "outside-project",
  ] as const)("leaves the lasting reason %s as a calm note", (reason) => {
    expect(transientGitError({ available: false, reason })).toBeUndefined();
  });

  it("leaves an available answer alone", () => {
    expect(transientGitError(AVAILABLE)).toBeUndefined();
  });
});
