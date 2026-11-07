// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { CurrentValue, KeyHistoryAvailable, KeyRevisionRow } from "../client/key-history.js";
import type { KeyRevisionsResult } from "../shared/rpc/key-revisions.js";
import { KeyHistoryPanel } from "./KeyHistoryPanel.js";
import { click, render } from "./test-support.js";
import type { KeyHistoryRead, KeyHistoryView } from "./use-key-history.js";
import { useKeyHistoryUi } from "./use-key-history-ui.js";

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

function many(count: number): KeyRevisionRow[] {
  return Array.from({ length: count }, (_, index) =>
    revision({
      commit: String(index).padStart(2, "0").repeat(20),
      value: `value ${index}`,
      subject: `subject ${index}`,
      diff: [],
    }),
  );
}

function available(
  overrides: Partial<Omit<KeyHistoryAvailable, "truncated">> = {},
): KeyRevisionsResult {
  const truncatedBy = overrides.truncatedBy ?? [];
  return {
    available: true,
    revisions: [revision()],
    unreadableRevisions: 0,
    ...overrides,
    truncated: truncatedBy.length > 0,
    truncatedBy,
  };
}

interface HarnessProps {
  readonly read: KeyHistoryRead;
  readonly current: CurrentValue;
  readonly locale: string;
  readonly onRestore: (revision: KeyRevisionRow) => void;
  readonly onReadFurther?: () => void;
}

function Harness({ read, current, locale, onRestore, onReadFurther }: HarnessProps): ReactNode {
  const ui = useKeyHistoryUi(locale, "greeting");
  return (
    <KeyHistoryPanel
      keyName="greeting"
      locale={locale}
      read={read}
      ui={{
        ...ui,
        readFurther: () => {
          onReadFurther?.();
          ui.readFurther();
        },
      }}
      current={current}
      onRestore={onRestore}
    />
  );
}

const KNOWN_HALLO: CurrentValue = { kind: "known", value: "Hallo" };

function panel(
  view: KeyHistoryView,
  props: {
    readonly current?: CurrentValue;
    readonly onRestore?: (revision: KeyRevisionRow) => void;
    readonly locale?: string;
    readonly retry?: () => void;
    readonly retrying?: boolean;
    readonly pending?: boolean;
    readonly onReadFurther?: () => void;
  } = {},
): ReturnType<typeof render> {
  const read: KeyHistoryRead = {
    view,
    retrying: props.retrying ?? false,
    pending: props.pending ?? false,
    retry: props.retry ?? (() => {}),
  };
  return render(
    <Harness
      read={read}
      current={props.current ?? KNOWN_HALLO}
      locale={props.locale ?? "de"}
      onRestore={props.onRestore ?? (() => {})}
      {...(props.onReadFurther !== undefined ? { onReadFurther: props.onReadFurther } : {})}
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
    expect(row.querySelector("[data-revision-meta] .font-mono")?.textContent).toBe("abcdef0");
    expect(row.querySelector("[data-revision-origin]")?.textContent).toContain("Human");
  });

  it("names the Restore button by its date and short hash", () => {
    const view = panel(data(available()));

    expect(view.get("button[data-restore]").getAttribute("aria-label")).toMatch(
      /^Restore the value from .*2026.* \(abcdef0\)$/,
    );
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
    expect(diff.querySelector('ins bdi bdi[dir="ltr"]')?.textContent).toBe("{new}");
  });

  it("isolates every diff segment, equal text included, so a bidi override cannot spill", () => {
    const view = panel(
      data(
        available({
          revisions: [
            revision({
              diff: [
                { kind: "equal", text: "a‮b" },
                { kind: "removed", text: "c‮d" },
                { kind: "added", text: "e‮f" },
              ],
            }),
          ],
        }),
      ),
    );
    const diff = view.get("[data-history-diff]");

    expect(
      diff.querySelectorAll(":scope > bdi, :scope > ins > bdi, :scope > del > bdi"),
    ).toHaveLength(3);
    for (const child of [...diff.children]) {
      const isolated = child.tagName === "BDI" || child.querySelector(":scope > bdi") !== null;
      expect(isolated).toBe(true);
    }
  });

  it("keeps a removed word and the added word after it apart", () => {
    const view = panel(
      data(
        available({
          revisions: [
            revision({
              diff: [
                { kind: "removed", text: "Servus" },
                { kind: "added", text: "Moin" },
              ],
            }),
          ],
        }),
      ),
    );

    expect(view.get("[data-history-diff]").textContent).toBe("removed: Servus added: Moin");
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

  it("says why a scrubbed working-tree value is not shown", () => {
    const view = panel(
      data(available({ workingTree: { value: "[REDACTED]", valueRedacted: true, diff: [] } })),
    );

    expect(view.get("[data-working-tree]").textContent).toContain("looks like an API key");
  });
});

describe("KeyHistoryPanel restore", () => {
  it("restores an unchanged-source revision straight away", () => {
    const onRestore = vi.fn();
    const view = panel(data(available()), { onRestore });

    click(view.get('button[aria-label^="Restore the value from"]'));

    expect(onRestore).toHaveBeenCalledWith(expect.objectContaining({ value: "Servus" }));
    expect(view.query("[data-restore-confirm]")).toBeNull();
  });

  it.each([
    [true, "changed", "has changed since this commit"],
    ["unknown", "unknown", "cannot tell whether"],
  ] as const)(
    "asks before restoring when sourceChanged is %s, with its own words",
    (changed, kind, words) => {
      const onRestore = vi.fn();
      const view = panel(data(available({ revisions: [revision({ sourceChanged: changed })] })), {
        onRestore,
      });

      click(view.get("button[data-restore]"));

      expect(onRestore).not.toHaveBeenCalled();
      const confirm = view.get("[data-restore-confirm]");
      expect(confirm.getAttribute("data-restore-confirm")).toBe(kind);
      expect(confirm.textContent).toContain(words);
      expect(confirm.textContent).toContain("counts as up to date");
      expect(confirm.textContent).toContain("translation memory");
      expect(confirm.className).toContain("rounded-lg");
      expect(document.activeElement?.textContent).toBe("Cancel");

      click(view.getByText("button", "Load as draft"));

      expect(onRestore).toHaveBeenCalledWith(expect.objectContaining({ value: "Servus" }));
      expect(view.query("[data-restore-confirm]")).toBeNull();
    },
  );

  it("returns focus to that row's Restore when the confirm is cancelled", () => {
    const view = panel(data(available({ revisions: [revision({ sourceChanged: true })] })));
    click(view.get("button[data-restore]"));

    click(view.getByText("button", "Cancel"));

    expect(view.query("[data-restore-confirm]")).toBeNull();
    expect(document.activeElement).toBe(view.get("button[data-restore]"));
  });

  it("cancels only the confirm on Escape, and nothing above it hears the key", () => {
    const view = panel(data(available({ revisions: [revision({ sourceChanged: true })] })));
    click(view.get("button[data-restore]"));
    const outside = vi.fn();
    document.addEventListener("keydown", outside);

    act(() => {
      document.activeElement?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
      );
    });
    document.removeEventListener("keydown", outside);

    expect(view.query("[data-restore-confirm]")).toBeNull();
    expect(document.activeElement).toBe(view.get("button[data-restore]"));
    expect(outside).not.toHaveBeenCalled();
  });

  it("drops an open confirm when a refresh no longer lists its commit, and does not bring it back", () => {
    const view = panel(data(available({ revisions: [revision({ sourceChanged: true })] })));
    click(view.get("button[data-restore]"));
    const render2 = (revisions: KeyRevisionRow[]): void =>
      view.rerender(
        <Harness
          read={{
            view: data(available({ revisions })),
            retrying: false,
            pending: false,
            retry: () => {},
          }}
          current={KNOWN_HALLO}
          locale="de"
          onRestore={() => {}}
        />,
      );

    render2([revision({ commit: "f".repeat(40) })]);
    expect(view.query("[data-restore-confirm]")).toBeNull();

    render2([revision({ sourceChanged: true })]);
    expect(view.query("[data-restore-confirm]")).toBeNull();
  });

  it("checks the newest answer at click time, so a source that changed under the row is confirmed", () => {
    const onRestore = vi.fn();
    const view = panel(data(available()), { onRestore });
    const button = view.get("button[data-restore]");

    view.rerender(
      <Harness
        read={{
          view: data(available({ revisions: [revision({ sourceChanged: true })] })),
          retrying: false,
          pending: false,
          retry: () => {},
        }}
        current={KNOWN_HALLO}
        locale="de"
        onRestore={onRestore}
      />,
    );
    click(button);

    expect(onRestore).not.toHaveBeenCalled();
    expect(view.get("[data-restore-confirm]").getAttribute("data-restore-confirm")).toBe("changed");
  });

  it("does not reopen a confirm the offer left and came back to, and leaves focus where it was", () => {
    const view = panel(data(available({ revisions: [revision({ sourceChanged: true })] })));
    click(view.get("button[data-restore]"));
    expect(view.query("[data-restore-confirm]")).not.toBeNull();
    const rerender = (current: CurrentValue): void =>
      view.rerender(
        <Harness
          read={{
            view: data(available({ revisions: [revision({ sourceChanged: true })] })),
            retrying: false,
            pending: false,
            retry: () => {},
          }}
          current={current}
          locale="de"
          onRestore={() => {}}
        />,
      );

    rerender({ kind: "known", value: "Servus" });
    expect(view.query("[data-restore-confirm]")).toBeNull();
    const elsewhere = document.createElement("button");
    document.body.append(elsewhere);
    act(() => elsewhere.focus());
    rerender(KNOWN_HALLO);

    expect(view.query("[data-restore-confirm]")).toBeNull();
    expect(document.activeElement).toBe(elsewhere);
    elsewhere.remove();
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
    const reason = view.get('[data-restore-reason="redacted"]').textContent ?? "";
    expect(reason).toContain("looks like an API key");
    expect(reason).toContain("cannot be restored from here");
    expect(reason).not.toContain("Studio hides");
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
    );
    const rows = view.all("[data-revision]");

    expect(rows[0]?.querySelector("button[data-restore]")).not.toBeNull();
    expect(rows[1]?.querySelector("button[data-restore]")).toBeNull();
    expect(rows[1]?.querySelector('[data-restore-reason="current"]')).not.toBeNull();
  });

  it("offers no Restore on any row until the current value is known", () => {
    const view = panel(data(available({ revisions: many(3) })), { current: { kind: "loading" } });

    expect(view.query("button[data-restore]")).toBeNull();
    expect(view.all('[data-restore-reason="unknown"]')).toHaveLength(3);
    expect(view.text()).toContain("once the current value has been read");
  });

  it("says why when the current value could not be read", () => {
    const view = panel(data(available()), {
      current: { kind: "failed", message: "the value read failed" },
    });

    expect(view.query("button[data-restore]")).toBeNull();
    expect(view.get('[data-restore-reason="unknown"]').textContent).toContain(
      "the value read failed",
    );
  });
});

describe("KeyHistoryPanel long lists", () => {
  it("shows twenty rows, then twenty more, and focuses the first new row", () => {
    const view = panel(data(available({ revisions: many(45) })));

    expect(view.all("[data-revision]")).toHaveLength(20);
    expect(view.get("[data-history-show-more]").textContent).toBe("Show 20 more");

    click(view.get("[data-history-show-more]"));

    expect(view.all("[data-revision]")).toHaveLength(40);
    expect(document.activeElement).toBe(view.all("[data-revision]")[20]);
    expect(view.get("[data-history-show-more]").textContent).toBe("Show 5 more");

    click(view.get("[data-history-show-more]"));

    expect(view.all("[data-revision]")).toHaveLength(45);
    expect(view.query("[data-history-show-more]")).toBeNull();
  });

  it("never clamps a value", () => {
    const long = "word ".repeat(2000);
    const view = panel(data(available({ revisions: [revision({ value: long, diff: [] })] })));

    expect(view.get("[data-revision-value]").textContent).toBe(long);
    expect(view.get("[data-revision-value]").className).not.toMatch(/line-clamp|truncate/);
  });
});

describe("KeyHistoryPanel honesty", () => {
  it("never reads as complete when the history was cut short", () => {
    const view = panel(
      data(
        available({
          revisions: [],
          truncatedBy: ["commit-limit", "unreadable-revision"],
          unreadableRevisions: 3,
          workingTreeUnreadable: true,
        }),
      ),
    );
    const notices = view.get("[data-history-notices]").textContent ?? "";

    expect(notices).toContain("newest 50 commits");
    expect(notices).toContain("3 commits");
    expect(notices).toContain("uncommitted");
    expect(view.get("[data-history-empty]").textContent).toContain("newest 50 commits");
  });

  it("offers one step further back when truncated, and reads at the cap", () => {
    const onReadFurther = vi.fn();
    const view = panel(data(available({ revisions: [], truncatedBy: ["commit-limit"] })), {
      onReadFurther,
    });

    click(view.get("[data-read-further]"));

    expect(onReadFurther).toHaveBeenCalledTimes(1);
  });

  it("shows the read-further control busy while that read runs", () => {
    const view = panel(data(available({ truncatedBy: ["commit-limit"] })), { pending: true });
    const button = view.get("[data-read-further]");

    expect(button.textContent).toBe("Reading further back…");
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(button.getAttribute("aria-disabled")).toBe("true");
  });

  it("offers no further step once the cap was read, and says that is as far as Studio goes", () => {
    const onReadFurther = vi.fn();
    const view = panel(data(available({ truncatedBy: ["commit-limit"] })), { onReadFurther });
    click(view.get("[data-read-further]"));

    view.rerender(
      <Harness
        read={{
          view: data(available({ truncatedBy: ["commit-limit"] })),
          retrying: false,
          pending: false,
          retry: () => {},
        }}
        current={KNOWN_HALLO}
        locale="de"
        onRestore={() => {}}
      />,
    );

    expect(view.query("[data-read-further]")).toBeNull();
    expect(view.get("[data-history-notices]").textContent).toContain("as far as it goes");
  });

  it.each(["shallow-clone", "deadline", "byte-budget", "scrub-cap"] as const)(
    "offers no further step, and names no limit, when %s was the only reason",
    (reason) => {
      const view = panel(data(available({ truncatedBy: [reason] })));

      expect(view.query("[data-read-further]")).toBeNull();
      expect(view.get("[data-history-notices]").textContent).not.toContain("newest 50");
      expect(view.all("[data-history-notices] li")).toHaveLength(1);
    },
  );

  it("says plainly when an empty list at the cap found nothing within 200 commits", () => {
    const view = panel(data(available({ revisions: [], truncatedBy: ["commit-limit"] })));
    click(view.get("[data-read-further]"));

    expect(view.get("[data-history-empty]").textContent).toBe(
      "No change to this key was found within 200 commits.",
    );
    expect(view.get("[data-history-notices]").textContent).toBe(
      "Studio reads at most 200 commits, and that is as far as it goes here.",
    );
  });

  it("offers no step when nothing was cut short", () => {
    const view = panel(data(available()));

    expect(view.query("[data-read-further]")).toBeNull();
  });

  it("says a complete empty history is empty", () => {
    const view = panel(data(available({ revisions: [] })));

    expect(view.get("[data-history-empty]").textContent).toContain("No commit has changed");
    expect(view.query("[data-history-notices]")).toBeNull();
  });

  it("shows notices above the rows when revisions exist", () => {
    const view = panel(
      data(available({ truncatedBy: ["unreadable-revision"], unreadableRevisions: 1 })),
    );

    expect(view.get("[data-history-notices]").className).toContain("rounded-lg");
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

describe("KeyHistoryPanel focus", () => {
  function harness(view: KeyHistoryView, retrying: boolean, retry = () => {}): ReactNode {
    return (
      <Harness
        read={{ view, retrying, pending: false, retry }}
        current={KNOWN_HALLO}
        locale="de"
        onRestore={() => {}}
      />
    );
  }

  it.each([
    ["error", { kind: "error", error: { code: "GIT_FAILED", message: "x" } } as KeyHistoryView],
    [
      "stale",
      {
        kind: "data",
        data: available(),
        stale: true,
        error: { code: "GIT_FAILED", message: "x" },
      } as KeyHistoryView,
    ],
  ])(
    "moves focus to the recovery target after a Retry that succeeded from the %s state",
    (_name, failing) => {
      const view = render(harness(failing, false));
      const retry = view.getByText("button", "Retry");
      act(() => retry.focus());
      click(retry);
      view.rerender(harness(failing, true));

      view.rerender(harness(data(available()), false));

      expect(document.activeElement).toBe(view.get('[data-recovery-target="key-history"]'));
    },
  );

  it("leaves focus on Retry when the Retry failed again", () => {
    const failing: KeyHistoryView = {
      kind: "error",
      error: { code: "GIT_FAILED", message: "x" },
    };
    const view = render(harness(failing, false));
    const retry = view.getByText("button", "Retry");
    act(() => retry.focus());
    click(retry);
    view.rerender(harness(failing, true));

    view.rerender(harness({ ...failing }, false));

    expect(document.activeElement).toBe(view.getByText("button", "Retry"));
  });

  it("never moves focus on a background refresh that nobody asked for", () => {
    const view = render(harness(data(available()), false));
    const restore = view.get("button[data-restore]");
    act(() => restore.focus());

    view.rerender(harness(data(available()), false));

    expect(document.activeElement).toBe(view.get("button[data-restore]"));
  });

  it("hands focus to the row when the focused Restore disappears because the row became current", () => {
    const view = render(harness(data(available()), false));
    act(() => view.get("button[data-restore]").focus());

    view.rerender(
      <Harness
        read={{ view: data(available()), retrying: false, pending: false, retry: () => {} }}
        current={{ kind: "known", value: "Servus" }}
        locale="de"
        onRestore={() => {}}
      />,
    );

    expect(document.activeElement).toBe(view.get("[data-revision]"));
  });

  it("hands focus to the next row when the focused row is removed", () => {
    const rows = many(3);
    const view = render(harness(data(available({ revisions: rows })), false));
    act(() => view.all("button[data-restore]")[0]?.focus());

    view.rerender(harness(data(available({ revisions: rows.slice(1) })), false));

    expect(document.activeElement).toBe(view.all("button[data-restore]")[0]);
    expect(document.activeElement?.closest("[data-revision]")?.getAttribute("data-revision")).toBe(
      rows[1]?.commit,
    );
  });

  it("falls back to the panel when every row is gone", () => {
    const view = render(harness(data(available({ revisions: many(1) })), false));
    act(() => view.get("button[data-restore]").focus());

    view.rerender(harness(data(available({ revisions: [] })), false));

    expect(document.activeElement).toBe(view.get('[data-recovery-target="key-history"]'));
  });
});
