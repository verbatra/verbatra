// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import {
  GIT_DIFF_MAX_VALUE_CHARS,
  GIT_DIFF_PAGE_SIZE,
  type GitAvailableDiff,
  type GitDiffView,
  type GitFile,
  type GitStatusView,
  type OpenDiff,
} from "../client/git-changes.js";
import { ChangesSection } from "./ChangesSection.js";
import { click, render } from "./test-support.js";

function status(files: readonly GitFile[], branch: string | null = "main"): GitStatusView {
  const result = { available: true as const, branch, files };
  return { kind: "data", stale: false, data: { result, lastAvailable: result } };
}

function diffOf(overrides: Partial<GitAvailableDiff> = {}): GitDiffView {
  return {
    kind: "data",
    stale: false,
    data: {
      available: true,
      path: "locales/de.json",
      state: "modified",
      added: [],
      removed: [],
      changed: [],
      truncated: false,
      ...overrides,
    },
  };
}

function section(
  props: {
    readonly status?: GitStatusView;
    readonly diff?: GitDiffView | undefined;
    readonly open?: OpenDiff | undefined;
    readonly onToggle?: (target: OpenDiff) => void;
    readonly hideCode?: string;
  } = {},
): ReturnType<typeof ChangesSection> {
  return (
    <ChangesSection
      status={props.status ?? status([])}
      diff={props.diff}
      open={props.open}
      onToggle={props.onToggle ?? (() => {})}
      hideCode={props.hideCode}
    />
  );
}

const DE_FILE: GitFile = { path: "locales/de.json", locales: ["de"], state: "modified" };
const DE_OPEN: OpenDiff = { locale: "de", path: "locales/de.json" };

describe("ChangesSection file list", () => {
  it("names the branch and says nothing differs for a clean repository", () => {
    const view = render(section());

    expect(view.get("[data-git-branch]").textContent).toBe("Branch main");
    expect(view.get("[data-git-clean]").textContent).toContain("No locale file differs");
    expect(view.query('[role="alert"]')).toBeNull();
  });

  it("says a detached HEAD in words", () => {
    const view = render(section({ status: status([], null) }));

    expect(view.get("[data-git-branch]").textContent).toBe("Detached HEAD");
  });

  it.each([
    ["modified", "Modified", "changed"],
    ["added", "Added", "success"],
    ["deleted", "Deleted", "danger"],
    ["untracked", "Untracked", "neutral"],
    ["conflicted", "Conflicted", "warning"],
  ] as const)("shows the %s state as a word and a tone", (state, word, tone) => {
    const view = render(section({ status: status([{ ...DE_FILE, state }]) }));

    const badge = view.get("[data-git-file] [data-tone]");
    expect(badge.textContent).toBe(word);
    expect(badge.getAttribute("data-tone")).toBe(tone);
  });

  it("lists the lock and provenance files with their state and no toggle", () => {
    const view = render(
      section({
        status: status([
          { path: "verbatra.lock.json", locales: [], state: "modified" },
          { path: "verbatra.provenance.json", locales: [], state: "untracked" },
        ]),
      }),
    );

    expect(view.all("[data-git-file]")).toHaveLength(2);
    expect(view.query("[data-git-toggle]")).toBeNull();
  });

  it("offers one toggle per locale of a shared catalogue and marks them collapsed", () => {
    const view = render(
      section({
        status: status([
          { path: "Localizable.xcstrings", locales: ["en", "de", "ar"], state: "modified" },
        ]),
      }),
    );

    const toggles = view.all("[data-git-toggle]");
    expect(toggles.map((toggle) => toggle.getAttribute("data-git-toggle"))).toEqual([
      "en",
      "de",
      "ar",
    ]);
    expect(toggles.every((toggle) => toggle.getAttribute("aria-expanded") === "false")).toBe(true);
  });

  it("offers one toggle for a locale that two apple files share", () => {
    const view = render(
      section({
        status: status([
          { path: "de.lproj/Localizable.strings", locales: ["de"], state: "modified" },
          { path: "de.lproj/Localizable.stringsdict", locales: ["de"], state: "modified" },
        ]),
      }),
    );

    expect(view.all("[data-git-toggle]")).toHaveLength(1);
  });

  it("reports the toggled locale and its file", () => {
    const onToggle = vi.fn();
    const view = render(section({ status: status([DE_FILE]), onToggle }));

    click(view.get('[data-git-toggle="de"]'));

    expect(onToggle).toHaveBeenCalledWith(DE_OPEN);
  });

  it("shows hostile file names, many files and a very long path as text that wraps", () => {
    const hostile = "locales/<img src=x onerror=alert(1)>/‮evil.json";
    const long = `locales/${"nested-".repeat(120)}de.json`;
    const many: GitFile[] = Array.from({ length: 300 }, (_, index) => ({
      path: `locales/file-${index}.json`,
      locales: [],
      state: "modified" as const,
    }));
    const view = render(
      section({
        status: status([
          { path: hostile, locales: ["de"], state: "modified" },
          { path: long, locales: ["fr"], state: "untracked" },
          ...many,
        ]),
      }),
    );

    const paths = view.all("[data-git-path]");
    expect(paths).toHaveLength(302);
    expect(paths[0]?.textContent).toBe(hostile);
    expect(paths[0]?.querySelector("img")).toBeNull();
    expect(paths[1]?.textContent).toBe(long);
    expect(paths[1]?.className).toContain("wrap-anywhere");
    expect(paths[1]?.getAttribute("dir")).toBe("auto");
    expect(view.container.querySelector("[title]")).toBeNull();
  });
});

describe("ChangesSection status states", () => {
  it("shows loading while the first read is open", () => {
    const view = render(section({ status: { kind: "loading" } }));

    expect(view.get('[role="status"]').textContent).toContain("Loading");
  });

  it("explains a project outside a repository calmly, with no alert", () => {
    const result = { available: false as const, reason: "not-a-repository" as const };
    const view = render(
      section({
        status: { kind: "data", stale: false, data: { result, lastAvailable: undefined } },
      }),
    );

    expect(view.get('[data-git-unavailable="not-a-repository"]').textContent).toContain(
      "Nothing is wrong",
    );
    expect(view.query('[role="alert"]')).toBeNull();
  });

  it("keeps the last known files with a calm notice once the repository stops being one", () => {
    const last = { available: true as const, branch: "main", files: [DE_FILE] };
    const view = render(
      section({
        status: {
          kind: "data",
          stale: false,
          data: {
            result: { available: false, reason: "git-missing" },
            lastAvailable: last,
          },
        },
        open: DE_OPEN,
        diff: diffOf(),
      }),
    );

    expect(view.get('[data-git-unavailable="git-missing"]').textContent).toContain(
      "Showing the last known changes.",
    );
    expect(view.all("[data-git-file]")).toHaveLength(1);
    expect(view.query('[role="alert"]')).toBeNull();
  });

  it("shows a failed first read as an alert without a Retry of its own", () => {
    const view = render(
      section({ status: { kind: "error", error: { code: "INTERNAL", message: "boom" } } }),
    );

    expect(view.get('[role="alert"]')).toBeTruthy();
    expect(view.query("[data-retry]")).toBeNull();
  });

  it("points at the page alert instead of repeating the same failure", () => {
    const view = render(
      section({
        status: { kind: "error", error: { code: "INTERNAL", message: "boom" } },
        hideCode: "INTERNAL",
      }),
    );

    expect(view.query('[role="alert"]')).toBeNull();
    expect(view.text()).toContain("Changes are unavailable. See the error above.");
  });

  it("keeps the files with a stale notice, and no Retry, when a re-read fails", () => {
    const result = { available: true as const, branch: "main", files: [DE_FILE] };
    const view = render(
      section({
        status: {
          kind: "data",
          stale: true,
          error: { code: "RATE", message: "slow down" },
          data: { result, lastAvailable: result },
        },
      }),
    );

    expect(view.get('[role="alert"]').textContent).toContain("Showing the last known changes.");
    expect(view.all("[data-git-file]")).toHaveLength(1);
    expect(view.query("[data-retry]")).toBeNull();
  });

  it("drops the stale notice when the page alert already carries that code", () => {
    const result = { available: true as const, branch: "main", files: [DE_FILE] };
    const view = render(
      section({
        status: {
          kind: "data",
          stale: true,
          error: { code: "RATE", message: "slow down" },
          data: { result, lastAvailable: result },
        },
        hideCode: "RATE",
      }),
    );

    expect(view.query('[role="alert"]')).toBeNull();
    expect(view.all("[data-git-file]")).toHaveLength(1);
  });
});

describe("ChangesSection key diff", () => {
  const withFile = { status: status([DE_FILE]), open: DE_OPEN };

  it("expands the open locale and wires the toggle to its panel", () => {
    const view = render(section({ ...withFile, diff: diffOf() }));

    const toggle = view.get('[data-git-toggle="de"]');
    const panel = view.get('[data-git-diff="de"]');
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(toggle.getAttribute("aria-controls")).toBe(panel.id);
  });

  it("shows loading in the panel while the diff reads", () => {
    const view = render(section({ ...withFile, diff: { kind: "loading" } }));

    expect(view.get('[data-git-diff="de"] [role="status"]').textContent).toContain("Loading");
  });

  it("lists changed, added and removed keys with their values as text", () => {
    const view = render(
      section({
        ...withFile,
        diff: diffOf({
          changed: [{ key: "greeting", before: "Hallo", after: "Servus" }],
          added: [{ key: "farewell", value: "Tschüss" }],
          removed: [{ key: "old", value: "Alt" }],
        }),
      }),
    );

    expect(view.get("[data-git-summary]").textContent).toBe("1 changed, 1 added, 1 removed");
    expect(view.all("[data-git-key]").map((node) => node.textContent)).toEqual([
      "greeting",
      "farewell",
      "old",
    ]);
    expect(view.all("[data-git-value]").map((node) => node.textContent)).toEqual([
      "Hallo",
      "Servus",
      "Tschüss",
      "Alt",
    ]);
  });

  it("links an added and a changed key to Translations and a removed key to nothing", () => {
    const view = render(
      section({
        ...withFile,
        diff: diffOf({
          changed: [{ key: "greeting", before: "a", after: "b" }],
          added: [{ key: "farewell", value: "c" }],
          removed: [{ key: "old", value: "d" }],
        }),
      }),
    );

    expect(view.all("[data-git-open]").map((link) => link.getAttribute("href"))).toEqual([
      "#/translations?locale=de&key=greeting",
      "#/translations?locale=de&key=farewell",
    ]);
  });

  it("offers no link for a key at the length cap", () => {
    const cut = "k".repeat(GIT_DIFF_MAX_VALUE_CHARS);
    const view = render(
      section({ ...withFile, diff: diffOf({ added: [{ key: cut, value: "x" }] }) }),
    );

    expect(view.query("[data-git-open]")).toBeNull();
  });

  it("sets an Arabic value in its own direction and language, with tokens kept left to right", () => {
    const view = render(
      section({
        status: status([{ path: "locales/ar.json", locales: ["ar"], state: "modified" }]),
        open: { locale: "ar", path: "locales/ar.json" },
        diff: diffOf({
          path: "locales/ar.json",
          changed: [{ key: "welcome", before: "مرحبا {name}", after: "أهلا {name} في المتجر" }],
        }),
      }),
    );

    const values = view.all("[data-git-value]");
    expect(values).toHaveLength(2);
    for (const value of values) {
      expect(value.getAttribute("dir")).toBe("rtl");
      expect(value.getAttribute("lang")).toBe("ar");
      expect(value.querySelector('bdi[dir="ltr"]')?.textContent).toBe("{name}");
      expect(value.getAttribute("title")).toBeNull();
    }
  });

  it("renders hostile markup in a value and a key as text, never as elements", () => {
    const markup = '<img src=x onerror="alert(1)"><script>alert(2)</script>';
    const view = render(
      section({
        ...withFile,
        diff: diffOf({ changed: [{ key: markup, before: markup, after: `${markup}!` }] }),
      }),
    );

    const panel = view.get('[data-git-diff="de"]');
    expect(panel.querySelector("img, script")).toBeNull();
    expect(view.get("[data-git-key]").textContent).toBe(markup);
    expect(view.all("[data-git-value]")[1]?.textContent).toBe(`${markup}!`);
  });

  it("wraps a long key and a long unbroken value, keeps line breaks, and adds no tooltip", () => {
    const longValue = "ä".repeat(GIT_DIFF_MAX_VALUE_CHARS);
    const view = render(
      section({
        ...withFile,
        diff: diffOf({
          added: [{ key: `deep.${"segment.".repeat(80)}key`, value: `${longValue}\nsecond line` }],
        }),
      }),
    );

    const value = view.get("[data-git-value]");
    expect(value.className).toContain("whitespace-pre-wrap");
    expect(value.className).toContain("wrap-anywhere");
    expect(value.textContent).toBe(`${longValue}\nsecond line`);
    expect(view.get("[data-git-key]").className).toContain("wrap-anywhere");
    expect(view.get("[data-git-key]").getAttribute("dir")).toBe("ltr");
    expect(view.container.querySelector("[title]")).toBeNull();
  });

  it("shows an empty value as a visible word", () => {
    const view = render(
      section({ ...withFile, diff: diffOf({ added: [{ key: "blank", value: "" }] }) }),
    );

    expect(view.get('[data-git-diff="de"]').textContent).toContain("Empty text");
  });

  it("says a list is incomplete when the sdk reports truncation, naming both causes", () => {
    const view = render(section({ ...withFile, diff: diffOf({ truncated: true }) }));

    const notice = view.get("[data-git-truncated]").textContent ?? "";
    expect(notice).toContain("more than 500 keys differ");
    expect(notice).toContain("longer than 2000 characters");
  });

  it("says nothing about truncation when the list is complete", () => {
    const view = render(section({ ...withFile, diff: diffOf() }));

    expect(view.query("[data-git-truncated]")).toBeNull();
  });

  it("shows a conflicted file with no diff and no counts", () => {
    const view = render(
      section({
        status: status([{ ...DE_FILE, state: "conflicted" }]),
        open: DE_OPEN,
        diff: diffOf({ state: "conflicted" }),
      }),
    );

    const panel = view.get('[data-git-diff="de"]');
    expect(panel.textContent).toContain("unresolved merge conflicts");
    expect(view.query("[data-git-summary]")).toBeNull();
  });

  it("says a file that matches the last commit has no key changes", () => {
    const view = render(section({ ...withFile, diff: diffOf({ state: "unchanged" }) }));

    expect(view.get('[data-git-diff="de"]').textContent).toContain("No key changes");
  });

  it("explains an unavailable comparison calmly, for every reason", () => {
    const reasons = [
      "custom-adapter",
      "revision-unreadable",
      "working-file-unreadable",
      "dubious-ownership",
    ] as const;
    for (const reason of reasons) {
      const view = render(
        section({
          ...withFile,
          diff: { kind: "data", stale: false, data: { available: false, reason } },
        }),
      );

      expect(view.get(`[data-git-unavailable="${reason}"]`).textContent?.length).toBeGreaterThan(
        20,
      );
      expect(view.query('[role="alert"]')).toBeNull();
      view.unmount();
    }
  });

  it("shows a failed diff read as an alert without a Retry, or points at the page alert", () => {
    const error = { code: "INTERNAL", message: "boom" };
    const own = render(section({ ...withFile, diff: { kind: "error", error } }));
    const shared = render(
      section({ ...withFile, diff: { kind: "error", error }, hideCode: "INTERNAL" }),
    );

    expect(own.get('[role="alert"]')).toBeTruthy();
    expect(own.query("[data-retry]")).toBeNull();
    expect(shared.query('[role="alert"]')).toBeNull();
    expect(shared.text()).toContain("Key changes are unavailable. See the error above.");
  });

  it("keeps the last key changes with a stale notice when a re-read fails", () => {
    const view = render(
      section({
        ...withFile,
        diff: {
          kind: "data",
          stale: true,
          error: { code: "RATE", message: "slow" },
          data: {
            available: true,
            path: "locales/de.json",
            state: "modified",
            added: [{ key: "k", value: "v" }],
            removed: [],
            changed: [],
            truncated: false,
          },
        },
      }),
    );

    expect(view.get('[role="alert"]').textContent).toContain("Showing the last known key changes.");
    expect(view.all("[data-git-key]")).toHaveLength(1);
  });

  it("keeps the open file listed, as matching the last commit, after the status stops listing it", () => {
    const view = render(
      section({ status: status([]), open: DE_OPEN, diff: diffOf({ state: "unchanged" }) }),
    );

    expect(view.get('[data-git-file="locales/de.json"]').textContent).toContain(
      "Matches last commit",
    );
    expect(view.get('[data-git-toggle="de"]').getAttribute("aria-expanded")).toBe("true");
  });

  it("shows 50 entries of a huge diff, then more on request, moving focus to the first new entry", () => {
    const added = Array.from({ length: 500 }, (_, index) => ({
      key: `key.${index}`,
      value: `value ${index}`,
    }));
    const view = render(section({ ...withFile, diff: diffOf({ added, truncated: true }) }));

    expect(view.all("[data-git-entry]")).toHaveLength(GIT_DIFF_PAGE_SIZE);

    click(view.get("[data-git-show-more]"));

    expect(view.all("[data-git-entry]")).toHaveLength(GIT_DIFF_PAGE_SIZE * 2);
    expect(document.activeElement).toBe(view.all("[data-git-entry]")[GIT_DIFF_PAGE_SIZE]);
  });

  it("offers no show-more control when everything fits", () => {
    const view = render(
      section({
        ...withFile,
        diff: diffOf({ added: [{ key: "a", value: "b" }] }),
      }),
    );

    expect(view.query("[data-git-show-more]")).toBeNull();
  });
});
