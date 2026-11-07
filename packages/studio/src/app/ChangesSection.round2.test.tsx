// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GIT_DIFF_MAX_ENTRIES,
  GIT_DIFF_MAX_VALUE_CHARS,
  type GitAvailableDiff,
  type GitDiffView,
  type GitFile,
  type GitStatusView,
  INITIAL_FILE_ROWS,
  type OpenDiff,
} from "../client/git-changes.js";
import { ChangesSection } from "./ChangesSection.js";
import { click, type RenderResult, render } from "./test-support.js";

function status(files: readonly GitFile[]): GitStatusView {
  const result = { available: true as const, branch: "main", files };
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

interface Props {
  readonly status: GitStatusView;
  readonly diff?: GitDiffView | undefined;
  readonly open?: OpenDiff | undefined;
  readonly orphaned?: ReadonlySet<string> | undefined;
  readonly onToggle?: (target: OpenDiff) => void;
  readonly hideCode?: string;
}

function section(props: Props): ReturnType<typeof ChangesSection> {
  return (
    <ChangesSection
      status={props.status}
      diff={props.diff}
      open={props.open}
      orphaned={"orphaned" in props ? props.orphaned : new Set()}
      onToggle={props.onToggle ?? (() => {})}
      hideCode={props.hideCode}
    />
  );
}

function file(locale: string, state: GitFile["state"] = "modified"): GitFile {
  return { path: `locales/${locale}.json`, locales: [locale], state };
}

function toggle(view: RenderResult, locale: string): HTMLElement {
  return view.get(`[data-git-toggle="${locale}"]`);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ChangesSection file list cap", () => {
  const many = Array.from({ length: 31 }, (_, index) => file(`l${index}`));

  it("shows ten files and a button for all of them", () => {
    const view = render(section({ status: status(many) }));

    expect(view.all("[data-git-file]")).toHaveLength(INITIAL_FILE_ROWS);
    expect(view.get("[data-git-show-all]").textContent).toBe("Show all 31 files");
  });

  it("shows every file on request and moves focus to the first new one", () => {
    const view = render(section({ status: status(many) }));

    click(view.get("[data-git-show-all]"));

    expect(view.all("[data-git-file]")).toHaveLength(31);
    expect(document.activeElement).toBe(view.all("[data-git-file]")[INITIAL_FILE_ROWS]);
    expect(view.query("[data-git-show-all]")).toBeNull();
  });

  it("makes the reveal buttons 44px targets below the md breakpoint", () => {
    const view = render(section({ status: status(many) }));
    const open = { locale: "l0", path: "locales/l0.json", position: 0 };
    const long = Array.from({ length: 80 }, (_, index) => ({ key: `k${index}`, value: "v" }));
    const diffView = render(
      section({ status: status([file("l0")]), open, diff: diffOf({ added: long }) }),
    );

    expect(view.get("[data-git-show-all]").className).toContain("max-md:min-h-11");
    expect(diffView.get("[data-git-show-more]").className).toContain("max-md:min-h-11");
  });

  it("offers no button for ten files or fewer", () => {
    const view = render(section({ status: status(many.slice(0, 10)) }));

    expect(view.query("[data-git-show-all]")).toBeNull();
  });

  it("keeps an open file below the cap on screen", () => {
    const view = render(
      section({
        status: status(many),
        open: { locale: "l25", path: "locales/l25.json", position: 25 },
        diff: diffOf(),
      }),
    );

    expect(view.query('[data-git-file="locales/l25.json"]')).not.toBeNull();
    expect(view.query('[data-git-diff="l25"]')).not.toBeNull();
  });
});

describe("ChangesSection focus after a background read", () => {
  const three = status([file("a"), file("b"), file("c")]);

  it("moves focus to the next toggle when the focused file leaves the list", () => {
    const view = render(section({ status: three }));
    toggle(view, "b").focus();

    view.rerender(section({ status: status([file("a"), file("c")]) }));

    expect(document.activeElement).toBe(toggle(view, "c"));
  });

  it("moves focus to the previous toggle when the last file leaves", () => {
    const view = render(section({ status: three }));
    toggle(view, "c").focus();

    view.rerender(section({ status: status([file("a"), file("b")]) }));

    expect(document.activeElement).toBe(toggle(view, "b"));
  });

  it("moves focus to the section heading when no toggle is left, never to the body", () => {
    const view = render(section({ status: status([file("a")]) }));
    toggle(view, "a").focus();

    view.rerender(section({ status: status([]) }));

    expect(document.activeElement).toBe(view.get("h2"));
    expect(document.activeElement).not.toBe(document.body);
  });

  it("leaves focus alone when it was never on a toggle", () => {
    const view = render(section({ status: three }));
    const outside = document.createElement("button");
    document.body.appendChild(outside);
    outside.focus();

    view.rerender(section({ status: status([file("a")]) }));

    expect(document.activeElement).toBe(outside);
    outside.remove();
  });

  it("keeps focus on a toggle that stays", () => {
    const view = render(section({ status: three }));
    const kept = toggle(view, "a");
    kept.focus();

    view.rerender(section({ status: status([file("a"), file("b")]) }));

    expect(document.activeElement).toBe(kept);
  });

  it("moves focus on when a matches-last-commit row is closed", () => {
    const open: OpenDiff = { locale: "b", path: "locales/b.json", position: 1 };
    const view = render(
      section({
        status: status([file("a"), file("c")]),
        open,
        diff: diffOf({ state: "unchanged" }),
      }),
    );
    expect(view.query('[data-git-file="locales/b.json"]')).not.toBeNull();
    toggle(view, "b").focus();

    view.rerender(section({ status: status([file("a"), file("c")]) }));

    expect(view.query('[data-git-file="locales/b.json"]')).toBeNull();
    expect(document.activeElement).toBe(toggle(view, "c"));
  });
});

describe("ChangesSection focus keeper details", () => {
  const three = status([file("a"), file("b"), file("c")]);

  it("never moves focus that the user already left, even when the old toggle later goes away", () => {
    const view = render(section({ status: three }));
    toggle(view, "b").focus();
    toggle(view, "b").blur();
    expect(document.activeElement).toBe(document.body);

    view.rerender(section({ status: status([file("a"), file("c")]) }));

    expect(document.activeElement).toBe(document.body);
  });

  it("never moves focus that sits on a control outside the section", () => {
    const view = render(section({ status: three }));
    toggle(view, "b").focus();
    const outside = document.createElement("button");
    document.body.appendChild(outside);
    outside.focus();

    view.rerender(section({ status: status([file("a"), file("c")]) }));

    expect(document.activeElement).toBe(outside);
    outside.remove();
  });

  it("hands focus over without scrolling", () => {
    const view = render(section({ status: three }));
    toggle(view, "b").focus();
    const focus = vi.spyOn(HTMLElement.prototype, "focus");

    view.rerender(section({ status: status([file("a"), file("c")]) }));

    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
  });

  it("leaves the handover toggle in the tab order", () => {
    const view = render(section({ status: three }));
    toggle(view, "b").focus();

    view.rerender(section({ status: status([file("a"), file("c")]) }));

    expect(document.activeElement).toBe(toggle(view, "c"));
    expect(toggle(view, "c").hasAttribute("tabindex")).toBe(false);
    expect(toggle(view, "a").hasAttribute("tabindex")).toBe(false);
  });

  it("makes the heading focusable only while it holds focus", () => {
    const view = render(section({ status: status([file("a")]) }));
    toggle(view, "a").focus();
    expect(view.get("h2").hasAttribute("tabindex")).toBe(false);

    view.rerender(section({ status: status([]) }));

    expect(document.activeElement).toBe(view.get("h2"));
    expect(view.get("h2").getAttribute("tabindex")).toBe("-1");

    view.get("h2").blur();

    expect(view.get("h2").hasAttribute("tabindex")).toBe(false);
  });

  it("moves focus from a link inside the open diff to its toggle when the link goes away", () => {
    const open: OpenDiff = { locale: "b", path: "locales/b.json", position: 1 };
    const withLink = section({
      status: three,
      open,
      diff: diffOf({ added: [{ key: "kept", value: "v" }] }),
    });
    const view = render(withLink);
    view.get("[data-git-open]").focus();
    expect(document.activeElement).toBe(view.get("[data-git-open]"));

    view.rerender(section({ status: three, open, diff: diffOf({ state: "unchanged" }) }));

    expect(view.query("[data-git-open]")).toBeNull();
    expect(document.activeElement).toBe(toggle(view, "b"));
  });

  it("drops focus quietly when the heading it would hand over to is gone too", () => {
    const view = render(section({ status: status([file("a")]) }));
    toggle(view, "a").focus();
    view.get("h2").remove();

    view.rerender(section({ status: status([]) }));

    expect(document.activeElement).toBe(document.body);
  });

  it("leaves focus on a reveal button alone, since it hands nothing over", () => {
    const many = Array.from({ length: 12 }, (_, index) => file(`m${index}`));
    const view = render(section({ status: status(many) }));
    view.get("[data-git-show-all]").focus();

    view.rerender(section({ status: status(many.slice(0, 10)) }));

    expect(document.activeElement).not.toBe(toggle(view, "m0"));
    expect(document.activeElement).toBe(document.body);
  });

  it("gives the file rows and the heading the focus ring", () => {
    const view = render(section({ status: three }));

    expect(view.get("[data-git-file]").className).toContain("focus-visible:outline-ring");
    expect(view.get("h2").className).toContain("focus-visible:outline");
  });
});

describe("ChangesSection open row position", () => {
  it("keeps a clean open row where it was instead of moving it to the end", () => {
    const view = render(
      section({
        status: status([file("a"), file("c")]),
        open: { locale: "b", path: "locales/b.json", position: 1 },
        diff: diffOf({ state: "unchanged" }),
      }),
    );

    expect(view.all("[data-git-path]").map((node) => node.textContent)).toEqual([
      "locales/a.json",
      "locales/b.json",
      "locales/c.json",
    ]);
  });
});

describe("ChangesSection scroll anchor", () => {
  it("keeps a toggle at the same place on screen when a panel above it collapses", () => {
    let top = 500;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      () => ({ top, bottom: top, left: 0, right: 0, width: 0, height: 0 }) as DOMRect,
    );
    const scrollBy = vi.spyOn(window, "scrollBy").mockImplementation(() => {});
    const onToggle = vi.fn();
    const files = status([file("a"), file("b")]);
    const view = render(
      section({
        status: files,
        open: { locale: "a", path: "locales/a.json", position: 0 },
        diff: diffOf(),
        onToggle,
      }),
    );

    click(toggle(view, "b"));
    top = 200;
    view.rerender(
      section({
        status: files,
        open: { locale: "b", path: "locales/b.json", position: 1 },
        diff: diffOf(),
        onToggle,
      }),
    );

    expect(onToggle).toHaveBeenCalledWith({ locale: "b", path: "locales/b.json", position: 1 });
    expect(scrollBy).toHaveBeenCalledWith(0, -300);
  });

  it("does not scroll when the toggle it remembered is no longer listed", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      () => ({ top: 300, bottom: 300, left: 0, right: 0, width: 0, height: 0 }) as DOMRect,
    );
    const scrollBy = vi.spyOn(window, "scrollBy").mockImplementation(() => {});
    const view = render(section({ status: status([file("a")]) }));

    click(toggle(view, "a"));
    view.rerender(
      section({
        status: status([]),
        open: { locale: "z", path: "locales/z.json", position: 0 },
        diff: diffOf(),
      }),
    );

    expect(scrollBy).not.toHaveBeenCalled();
  });

  it("does not scroll when the toggle did not move", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      () => ({ top: 120, bottom: 120, left: 0, right: 0, width: 0, height: 0 }) as DOMRect,
    );
    const scrollBy = vi.spyOn(window, "scrollBy").mockImplementation(() => {});
    const files = status([file("a")]);
    const view = render(section({ status: files }));

    click(toggle(view, "a"));
    view.rerender(
      section({
        status: files,
        open: { locale: "a", path: "locales/a.json", position: 0 },
        diff: diffOf(),
      }),
    );

    expect(scrollBy).not.toHaveBeenCalled();
  });

  it("never scrolls for a read that nobody asked for", () => {
    const scrollBy = vi.spyOn(window, "scrollBy").mockImplementation(() => {});
    const files = status([file("a")]);
    const view = render(
      section({
        status: files,
        open: { locale: "a", path: "locales/a.json", position: 0 },
        diff: diffOf(),
      }),
    );

    view.rerender(
      section({
        status: status([file("a"), file("b")]),
        open: { locale: "a", path: "locales/a.json", position: 0 },
        diff: diffOf({ added: [{ key: "k", value: "v" }] }),
      }),
    );

    expect(scrollBy).not.toHaveBeenCalled();
  });
});

describe("ChangesSection toggles and panels", () => {
  it("names a panel in aria-controls only while it exists", () => {
    const open: OpenDiff = { locale: "a", path: "locales/a.json", position: 0 };
    const files = status([file("a")]);
    const waiting = render(section({ status: files, open }));
    const shown = render(section({ status: files, open, diff: diffOf() }));

    expect(toggle(waiting, "a").getAttribute("aria-expanded")).toBe("true");
    expect(toggle(waiting, "a").hasAttribute("aria-controls")).toBe(false);
    expect(toggle(shown, "a").getAttribute("aria-controls")).toBe(
      shown.get('[data-git-diff="a"]').id,
    );
  });

  it("makes a toggle a 44px target below the md breakpoint", () => {
    const view = render(section({ status: status([file("a")]) }));

    expect(toggle(view, "a").className).toContain("max-md:min-h-11");
  });

  it("heads each key group one level under the section heading", () => {
    const view = render(
      section({
        status: status([file("a")]),
        open: { locale: "a", path: "locales/a.json", position: 0 },
        diff: diffOf({ added: [{ key: "k", value: "v" }] }),
      }),
    );

    expect(view.all("h2")).toHaveLength(1);
    expect(view.all("h3").map((heading) => heading.textContent)).toEqual(["Added (1)"]);
    expect(view.query("h4")).toBeNull();
  });
});

describe("ChangesSection key diff details", () => {
  const open: OpenDiff = { locale: "de", path: "locales/de.json", position: 0 };
  const files = status([file("de")]);

  it("says a modified file with no key difference changed only in order or formatting", () => {
    const view = render(section({ status: files, open, diff: diffOf() }));

    expect(view.get("[data-git-no-key-differs]").textContent).toBe(
      "No key differs: only the order or formatting of the file changed.",
    );
    expect(view.query("[data-git-summary]")).toBeNull();
  });

  it("says a file that matches the last commit differently from one that only moved keys", () => {
    const view = render(section({ status: files, open, diff: diffOf({ state: "unchanged" }) }));

    expect(view.query("[data-git-no-key-differs]")).toBeNull();
    expect(view.get('[data-git-diff="de"]').textContent).toContain("matches the last commit");
  });

  it("reads at least when the entry cap was reached, not an exact count", () => {
    const changed = Array.from({ length: GIT_DIFF_MAX_ENTRIES }, (_, index) => ({
      key: `k${index}`,
      before: "a",
      after: "b",
    }));
    const view = render(
      section({ status: files, open, diff: diffOf({ changed, truncated: true }) }),
    );

    expect(view.get("[data-git-summary]").textContent).toBe(
      "500+ keys differ; listed: 500 changed, 0 added, 0 removed",
    );
  });

  it("marks a value and a key at the sdk cut as cut", () => {
    const cut = "x".repeat(GIT_DIFF_MAX_VALUE_CHARS);
    const view = render(
      section({
        status: files,
        open,
        diff: diffOf({ added: [{ key: cut, value: cut }], truncated: true }),
      }),
    );

    expect(view.all("[data-git-cut]")).toHaveLength(2);
    expect(view.get("[data-git-cut]").textContent).toBe("Cut at 2000 characters.");
  });

  it("marks nothing as cut for an ordinary value", () => {
    const view = render(
      section({ status: files, open, diff: diffOf({ added: [{ key: "k", value: "v" }] }) }),
    );

    expect(view.query("[data-git-cut]")).toBeNull();
  });

  it("links a key the source has and not a key it does not have", () => {
    const view = render(
      section({
        status: files,
        open,
        orphaned: new Set(["stray"]),
        diff: diffOf({
          added: [
            { key: "kept", value: "v" },
            { key: "stray", value: "v" },
          ],
        }),
      }),
    );

    expect(view.all("[data-git-open]").map((link) => link.getAttribute("href"))).toEqual([
      "#/translations?locale=de&key=kept",
    ]);
  });

  it("links nothing while the orphaned keys are unknown", () => {
    const view = render(
      section({
        status: files,
        open,
        orphaned: undefined,
        diff: diffOf({ added: [{ key: "kept", value: "v" }] }),
      }),
    );

    expect(view.query("[data-git-open]")).toBeNull();
  });

  it("keeps two keys that share a cut prefix as two entries", () => {
    const prefix = "p".repeat(GIT_DIFF_MAX_VALUE_CHARS);
    const view = render(
      section({
        status: files,
        open,
        diff: diffOf({
          added: [
            { key: prefix, value: "1" },
            { key: prefix, value: "2" },
          ],
        }),
      }),
    );

    expect(view.all("[data-git-entry]")).toHaveLength(2);
  });
});

describe("ChangesSection unavailable and failed reads", () => {
  it("explains an outside-project pattern calmly", () => {
    const result = { available: false as const, reason: "outside-project" as const };
    const view = render(
      section({
        status: { kind: "data", stale: false, data: { result, lastAvailable: undefined } },
      }),
    );

    expect(view.get('[data-git-unavailable="outside-project"]').textContent).toContain(
      "outside the project folder",
    );
    expect(view.query('[role="alert"]')).toBeNull();
  });

  it.each([
    ["timeout", "GIT_TIMEOUT"],
    ["git-failed", "GIT_FAILED"],
  ] as const)("points a %s answer at the page alert that carries it", (reason, code) => {
    const result = { available: false as const, reason };
    const view = render(
      section({
        status: { kind: "data", stale: false, data: { result, lastAvailable: undefined } },
        hideCode: code,
      }),
    );

    expect(view.get("[data-git-unavailable]").textContent).toBe(
      "Changes are unavailable. See the error above.",
    );
  });

  it("states a timeout itself when the page alert does not carry it", () => {
    const result = { available: false as const, reason: "timeout" as const };
    const view = render(
      section({
        status: { kind: "data", stale: false, data: { result, lastAvailable: undefined } },
      }),
    );

    expect(view.get("[data-git-unavailable]").textContent).toContain("took too long");
  });

  it("points a transient key diff answer at the page alert that carries it", () => {
    const view = render(
      section({
        status: status([file("de")]),
        open: { locale: "de", path: "locales/de.json", position: 0 },
        diff: {
          kind: "data",
          stale: false,
          data: { available: false, reason: "timeout" },
        },
        hideCode: "GIT_TIMEOUT",
      }),
    );

    expect(view.get('[data-git-diff="de"] [data-git-unavailable]').textContent).toBe(
      "Key changes are unavailable. See the error above.",
    );
  });

  it("says in its own words that a rate-limited read pauses briefly", () => {
    const view = render(
      section({
        status: {
          kind: "error",
          error: { code: "METHOD_RATE_LIMITED", message: "slow", retryAfterSeconds: 3 },
        },
      }),
    );

    expect(view.get('[role="alert"]').textContent).toContain("Reading changes pauses briefly");
    expect(view.get('[role="alert"]').textContent).toContain("Try again in 3 seconds");
  });
});
