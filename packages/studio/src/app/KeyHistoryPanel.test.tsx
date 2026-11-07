// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import type { KeyHistoryAvailable, KeyRevisionRow } from "../client/key-history.js";
import type { KeyRevisionsResult } from "../shared/rpc/key-revisions.js";
import { KeyHistoryPanel } from "./KeyHistoryPanel.js";
import { click, render } from "./test-support.js";
import type { KeyHistoryRead, KeyHistoryView } from "./use-key-history.js";

vi.mock("./api.js", () => import("./test-support.js").then((module) => module.apiMock()));

function revision(overrides: Partial<KeyRevisionRow> = {}): KeyRevisionRow {
  return {
    commit: "abcdef0123456789abcdef0123456789abcdef01",
    authorDate: "2026-01-02T03:04:05+00:00",
    author: "Ada Lovelace",
    subject: "reword the greeting",
    value: "Servus",
    origin: "human",
    sourceChanged: false,
    diff: [
      { kind: "removed", text: "Hallo" },
      { kind: "added", text: "Servus" },
    ],
    ...overrides,
  };
}

function available(overrides: Partial<KeyHistoryAvailable> = {}): KeyRevisionsResult {
  return {
    available: true,
    revisions: [revision()],
    truncated: false,
    unreadableRevisions: 0,
    ...overrides,
  };
}

function panel(
  view: KeyHistoryView,
  props: {
    readonly current?: string | undefined;
    readonly canWrite?: boolean;
    readonly onRestore?: (value: string) => void;
    readonly locale?: string;
    readonly retry?: () => void;
  } = {},
): ReturnType<typeof render> {
  const read: KeyHistoryRead = { view, retrying: false, retry: props.retry ?? (() => {}) };
  return render(
    <KeyHistoryPanel
      keyName="greeting"
      locale={props.locale ?? "de"}
      read={read}
      current={"current" in props ? props.current : "Hallo"}
      canWrite={props.canWrite ?? true}
      onRestore={props.onRestore ?? (() => {})}
    />,
  );
}

function data(result: KeyRevisionsResult): KeyHistoryView {
  return { kind: "data", data: result, stale: false };
}

describe("KeyHistoryPanel rows", () => {
  it("shows the author, a dated time element, the subject, the origin and the short hash", () => {
    const view = panel(data(available()));
    const row = view.get('[data-revision="abcdef0123456789abcdef0123456789abcdef01"]');

    expect(row.querySelector("time")?.getAttribute("datetime")).toBe("2026-01-02T03:04:05+00:00");
    expect(row.querySelector("time")?.textContent).toMatch(/2026/);
    expect(row.textContent).toContain("Ada Lovelace");
    expect(row.querySelector("[data-revision-subject]")?.getAttribute("dir")).toBe("auto");
    expect(row.textContent).toContain("reword the greeting");
    expect(row.textContent).toContain("abcdef0");
    expect(row.querySelector("[data-revision-origin]")?.textContent).toContain("Human");
  });

  it("renders a value that looks like markup as text and never as elements", () => {
    const hostile = '<img src=x onerror="alert(1)"> and <b>bold</b>';
    const view = panel(
      data(available({ revisions: [revision({ value: hostile, subject: hostile, diff: [] })] })),
    );

    expect(view.container.querySelector("img")).toBeNull();
    expect(view.container.querySelector("b")).toBeNull();
    expect(view.get("[data-revision-value]").textContent).toBe(hostile);
    expect(view.get("[data-revision-subject]").textContent).toBe(hostile);
  });

  it("gives the value its locale, an RTL direction for Arabic and isolated placeholders", () => {
    const view = panel(
      data(available({ revisions: [revision({ value: "مرحبا {name}", diff: [] })] })),
      { locale: "ar" },
    );
    const value = view.get("[data-revision-value]");

    expect(value.getAttribute("lang")).toBe("ar");
    expect(value.getAttribute("dir")).toBe("rtl");
    expect(value.querySelector('bdi[dir="ltr"]')?.textContent).toBe("{name}");
  });

  it("shows the word diff with insertions, deletions and a spoken label for each", () => {
    const view = panel(
      data(
        available({
          revisions: [
            revision({
              diff: [
                { kind: "equal", text: "Hi " },
                { kind: "removed", text: "{old}" },
                { kind: "added", text: "{new}" },
              ],
            }),
          ],
        }),
      ),
    );
    const diff = view.get("[data-history-diff]");

    expect(diff.querySelector('del[data-diff-kind="removed"]')?.textContent).toBe("removed: {old}");
    expect(diff.querySelector('ins[data-diff-kind="added"]')?.textContent).toBe("added: {new}");
    expect(diff.querySelector('ins bdi[dir="ltr"]')?.textContent).toBe("{new}");
  });

  it("leaves out the diff block for the first appearance of a key", () => {
    const view = panel(
      data(available({ revisions: [revision({ diff: [{ kind: "added", text: "Servus" }] })] })),
    );

    expect(view.query("[data-history-diff]")).toBeNull();
  });

  it("puts the uncommitted value first and offers it no Restore", () => {
    const view = panel(
      data(
        available({
          workingTree: { value: "Moin", diff: [{ kind: "equal", text: "Moin" }] },
        }),
      ),
    );
    const rows = view.all("[data-history-list] > li");

    expect(rows[0]?.hasAttribute("data-working-tree")).toBe(true);
    expect(rows[0]?.textContent).toContain("Working tree (uncommitted)");
    expect(rows[0]?.querySelector("button")).toBeNull();
    expect(rows[1]?.querySelector("button[data-restore]")).not.toBeNull();
  });

  it("says why a scrubbed working-tree value is hidden", () => {
    const view = panel(
      data(available({ workingTree: { value: "[REDACTED]", valueRedacted: true, diff: [] } })),
    );

    expect(view.get("[data-working-tree]").textContent).toContain("hides it");
  });
});

describe("KeyHistoryPanel restore", () => {
  it("restores an unchanged-source revision straight away", () => {
    const onRestore = vi.fn();
    const view = panel(data(available()), { onRestore });

    click(view.get('button[aria-label^="Restore the value from"]'));

    expect(onRestore).toHaveBeenCalledWith("Servus");
    expect(view.query("[data-restore-confirm]")).toBeNull();
  });

  it.each([true, "unknown"] as const)(
    "asks before restoring when sourceChanged is %s, and loads nothing until confirmed",
    (changed) => {
      const onRestore = vi.fn();
      const view = panel(data(available({ revisions: [revision({ sourceChanged: changed })] })), {
        onRestore,
      });

      click(view.get("button[data-restore]"));

      expect(onRestore).not.toHaveBeenCalled();
      const confirm = view.get("[data-restore-confirm]");
      expect(confirm.textContent).toContain("counts as up to date");
      expect(confirm.textContent).toContain("translation memory");
      expect(document.activeElement?.textContent).toBe("Cancel");

      click(view.getByText("button", "Load as draft"));

      expect(onRestore).toHaveBeenCalledWith("Servus");
      expect(view.query("[data-restore-confirm]")).toBeNull();
    },
  );

  it("closes the confirm on Cancel without loading", () => {
    const onRestore = vi.fn();
    const view = panel(data(available({ revisions: [revision({ sourceChanged: true })] })), {
      onRestore,
    });
    click(view.get("button[data-restore]"));

    click(view.getByText("button", "Cancel"));

    expect(onRestore).not.toHaveBeenCalled();
    expect(view.query("[data-restore-confirm]")).toBeNull();
  });

  it("drops an open confirm when a refresh no longer lists its commit", () => {
    const view = panel(data(available({ revisions: [revision({ sourceChanged: true })] })));
    click(view.get("button[data-restore]"));
    expect(view.query("[data-restore-confirm]")).not.toBeNull();

    view.rerender(
      <KeyHistoryPanel
        keyName="greeting"
        locale="de"
        read={{
          view: data(available({ revisions: [revision({ commit: "f".repeat(40) })] })),
          retrying: false,
          retry: () => {},
        }}
        current="Hallo"
        canWrite
        onRestore={() => {}}
      />,
    );

    expect(view.query("[data-restore-confirm]")).toBeNull();
  });

  it("offers no Restore for a scrubbed value and says why in visible text", () => {
    const view = panel(
      data(
        available({
          revisions: [revision({ value: "[REDACTED]", valueRedacted: true, sourceChanged: true })],
        }),
      ),
    );

    expect(view.query("button[data-restore]")).toBeNull();
    expect(view.get('[data-restore-reason="redacted"]').textContent).toContain("cannot restore");
  });

  it("offers no Restore for the value the key has now, even when it is not the newest revision", () => {
    const view = panel(
      data(
        available({
          revisions: [
            revision({ commit: "1".repeat(40), value: "Newer" }),
            revision({ value: "Hallo" }),
          ],
        }),
      ),
      { current: "Hallo" },
    );
    const rows = view.all("[data-revision]");

    expect(rows[0]?.querySelector("button[data-restore]")).not.toBeNull();
    expect(rows[1]?.querySelector("button[data-restore]")).toBeNull();
    expect(rows[1]?.querySelector('[data-restore-reason="current"]')).not.toBeNull();
  });

  it("offers no Restore when the project cannot be written, and says so", () => {
    const view = panel(data(available()), { canWrite: false });

    expect(view.query("button[data-restore]")).toBeNull();
    expect(view.get('[data-restore-reason="unavailable"]').textContent).toContain("write access");
  });
});

describe("KeyHistoryPanel honesty", () => {
  it("never reads as complete when the history was cut short", () => {
    const view = panel(
      data(
        available({
          revisions: [],
          truncated: true,
          unreadableRevisions: 3,
          workingTreeUnreadable: true,
        }),
      ),
    );
    const notices = view.get("[data-history-notices]").textContent ?? "";

    expect(notices).toContain("may be incomplete");
    expect(notices).toContain("3 commits");
    expect(notices).toContain("uncommitted");
    expect(view.get("[data-history-empty]").textContent).toContain("could read");
  });

  it("says a complete empty history is empty", () => {
    const view = panel(data(available({ revisions: [] })));

    expect(view.get("[data-history-empty]").textContent).toContain("No commit has changed");
    expect(view.query("[data-history-notices]")).toBeNull();
  });

  it("shows notices above the rows when revisions exist", () => {
    const view = panel(data(available({ truncated: true })));

    expect(view.get("[data-history-notices]")).not.toBeNull();
    expect(view.query("[data-history-empty]")).toBeNull();
  });

  it.each(["not-a-repository", "dubious-ownership", "git-missing"] as const)(
    "explains %s without an alert",
    (reason) => {
      const view = panel(data({ available: false, reason }));

      expect(
        view.get(`[data-history-unavailable="${reason}"]`).textContent?.length,
      ).toBeGreaterThan(10);
      expect(view.query('[role="alert"]')).toBeNull();
    },
  );

  it("shows a loading note while the first answer is pending", () => {
    const view = panel({ kind: "loading" });

    expect(view.get('[role="status"]').textContent).toContain("Reading the history");
  });

  it("shows the error with a Retry when the first read fails", () => {
    const retry = vi.fn();
    const view = panel(
      { kind: "error", error: { code: "GIT_TIMEOUT", message: "too slow" } },
      { retry },
    );

    click(view.getByText("button", "Retry"));

    expect(view.get('[role="alert"]').textContent).toContain("too slow");
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("keeps the last answer under a stale notice when a refresh fails", () => {
    const view = panel({
      kind: "data",
      data: available(),
      stale: true,
      error: { code: "GIT_FAILED", message: "git broke" },
    });

    expect(view.get('[role="alert"]').textContent).toContain("last answer is shown");
    expect(view.query("[data-revision]")).not.toBeNull();
  });
});
