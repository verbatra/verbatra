// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { formatTimestamp } from "../client/ui-format.js";
import type { HistoryCommit } from "../shared/rpc/history.js";
import { CommitList } from "./CommitList.js";
import { render } from "./test-support.js";
import type { HistoryState } from "./use-history-list.js";

const COMMIT: HistoryCommit = {
  hash: "0123456789abcdef",
  author: "Ada Lovelace",
  authorDate: "2026-07-18T09:41:12+02:00",
  subject: "chore(i18n): sync de and fr",
  touchedPaths: ["locales/de.json", "locales/fr.json"],
};

const LOADED: HistoryState = { kind: "loaded", commits: [COMMIT] };
const EMPTY: HistoryState = { kind: "loaded", commits: [] };

describe("CommitList", () => {
  it("announces the in-flight read as a status region", () => {
    const view = render(<CommitList state={{ kind: "loading" }} emptyMessage="No commits." />);

    expect(view.get('[role="status"]').textContent).toContain("Loading...");
  });

  it("renders a failed read as the shared error surface, resolving the code to actionable copy", () => {
    const state: HistoryState = {
      kind: "error",
      error: { code: "INTERNAL", message: "git blew up" },
    };

    const view = render(<CommitList state={state} emptyMessage="No commits." />);

    expect(view.get('[role="alert"]').textContent).toBe(
      "An unexpected server error occurred. Check the terminal running Studio for details.",
    );
  });

  it("explains a project without git as an empty state rather than an error", () => {
    const view = render(
      <CommitList
        state={{ kind: "unavailable", reason: "not-a-repository" }}
        emptyMessage="No commits."
      />,
    );

    expect(view.query('[role="alert"]')).toBeNull();
    expect(view.getByText("p", "History unavailable")).not.toBeNull();
    expect(view.text()).toContain("This project is not a git repository, or git is not installed.");
  });

  it.each([
    ["timeout", "Reading the git history took too long and was stopped."],
    ["output-too-large", "The git history is too large to read here."],
    ["git-missing", "This project is not a git repository, or git is not installed."],
  ] as const)("explains the unavailable reason %s", (reason, message) => {
    const view = render(
      <CommitList state={{ kind: "unavailable", reason }} compact emptyMessage="No commits." />,
    );

    expect(view.text()).toBe(message);
  });

  it("drops the empty-state chrome for the unavailable case when compact", () => {
    const view = render(
      <CommitList
        state={{ kind: "unavailable", reason: "not-a-repository" }}
        compact
        emptyMessage="No commits."
      />,
    );

    expect(view.query('[role="alert"]')).toBeNull();
    expect(view.text()).toBe("This project is not a git repository, or git is not installed.");
  });

  it("shows the caller's message under a titled empty state when history has no commits", () => {
    const view = render(
      <CommitList state={EMPTY} emptyMessage="No commit history yet for the locale files." />,
    );

    expect(view.getByText("p", "No commits yet")).not.toBeNull();
    expect(view.text()).toContain("No commit history yet for the locale files.");
  });

  it("shows only the caller's message when the no-commits case is compact", () => {
    const view = render(
      <CommitList
        state={EMPTY}
        compact
        emptyMessage="No commit history yet for the locale files."
      />,
    );

    expect(view.text()).toBe("No commit history yet for the locale files.");
  });

  it("renders one feed row per commit, keyed by hash", () => {
    const second: HistoryCommit = {
      ...COMMIT,
      hash: "fedcba9876543210",
      subject: "fix: de plural",
    };
    const view = render(
      <CommitList state={{ kind: "loaded", commits: [COMMIT, second] }} emptyMessage="none" />,
    );

    expect(view.all('ul[aria-label="Commits"] > li')).toHaveLength(2);
  });

  it("shows the commit subject as the row's lead line", () => {
    const view = render(<CommitList state={LOADED} emptyMessage="none" />);

    expect(view.get("[data-commit-subject]").textContent).toBe("chore(i18n): sync de and fr");
  });

  it("lets a long unbroken subject, author and path wrap inside the row", () => {
    const long = "x".repeat(200);
    const view = render(
      <CommitList
        state={{
          kind: "loaded",
          commits: [{ ...COMMIT, subject: long, author: long, touchedPaths: [`locales/${long}`] }],
        }}
        emptyMessage="none"
      />,
    );
    const wrapping = [
      view.get("[data-commit-subject]"),
      view.get("[data-commit-author]"),
      view.get('[aria-label="Files changed"] li'),
    ];

    for (const node of wrapping) {
      expect(node.className).toContain("wrap-anywhere");
    }
  });

  it("sets the direction of git text from its own content, so an Arabic subject reads right to left", () => {
    const arabic: HistoryCommit = {
      ...COMMIT,
      subject: "تحديث ملفات الترجمة العربية",
      author: "علي حسن",
      touchedPaths: ["locales/ar/ملف.json"],
    };
    const view = render(
      <CommitList state={{ kind: "loaded", commits: [arabic] }} emptyMessage="none" />,
    );

    expect(view.get("[data-commit-subject]").getAttribute("dir")).toBe("auto");
    expect(view.get("[data-commit-author]").textContent).toBe("علي حسن");
    expect(view.get('[aria-label="Files changed"] li').getAttribute("dir")).toBe("auto");
  });

  it("keeps the hash left to right and carries no native title anywhere", () => {
    const view = render(<CommitList state={LOADED} emptyMessage="none" />);

    expect(view.getByText("span", "0123456").getAttribute("dir")).toBe("ltr");
    expect(view.query("[title]")).toBeNull();
  });

  it("shortens the hash to the conventional seven characters", () => {
    const view = render(<CommitList state={LOADED} emptyMessage="none" />);

    expect(view.getByText("span", "0123456")).not.toBeNull();
  });

  it("shows the date and time as visible text in a time element that carries the full ISO date", () => {
    const view = render(<CommitList state={LOADED} emptyMessage="none" />);
    const dateLabel = view.get("li time");

    expect(dateLabel.textContent).toBe(formatTimestamp(COMMIT.authorDate));
    expect(dateLabel.getAttribute("datetime")).toBe("2026-07-18T09:41:12+02:00");
    expect(dateLabel.getAttribute("title")).toBeNull();
  });

  it("names the commit author after the date, so only the name wraps", () => {
    const view = render(<CommitList state={LOADED} emptyMessage="none" />);
    const parts = [...view.get("[data-commit-meta]").children].map((node) => node.textContent);

    expect(parts).toEqual(["0123456", formatTimestamp(COMMIT.authorDate), "Ada Lovelace"]);
  });

  it("writes the author name as text, so a name shaped like markup never becomes markup", () => {
    const hostile: HistoryCommit = { ...COMMIT, author: "<img src=x onerror=alert(1)>" };

    const view = render(
      <CommitList state={{ kind: "loaded", commits: [hostile] }} emptyMessage="none" />,
    );

    expect(view.query("img")).toBeNull();
    expect(view.getByText("span", "<img src=x onerror=alert(1)>")).not.toBeNull();
  });

  it("writes git-sourced text as text, so a subject shaped like markup never becomes markup", () => {
    const hostile: HistoryCommit = { ...COMMIT, subject: "<img src=x onerror=alert(1)>" };

    const view = render(
      <CommitList state={{ kind: "loaded", commits: [hostile] }} emptyMessage="none" />,
    );

    expect(view.query("img")).toBeNull();
    expect(view.get("[data-commit-subject]").textContent).toBe("<img src=x onerror=alert(1)>");
  });

  it("lists the files a commit touched under a named list", () => {
    const view = render(<CommitList state={LOADED} emptyMessage="none" />);
    const paths = view.get('[aria-label="Files changed"]');

    expect([...paths.querySelectorAll("li")].map((item) => item.textContent)).toEqual([
      "locales/de.json",
      "locales/fr.json",
    ]);
  });

  it("omits the touched-paths list entirely for a commit that reports none", () => {
    const noPaths: HistoryCommit = { ...COMMIT, touchedPaths: [] };

    const view = render(
      <CommitList state={{ kind: "loaded", commits: [noPaths] }} emptyMessage="none" />,
    );

    expect(view.query('[aria-label="Files changed"]')).toBeNull();
  });

  it("keeps the commits and says the history is the last known one when a re-read failed", () => {
    const stale: HistoryState = {
      kind: "loaded",
      commits: [COMMIT],
      staleError: { code: "INTERNAL", message: "git blew up" },
    };

    const view = render(<CommitList state={stale} emptyMessage="none" />);

    expect(view.get('[role="alert"]').textContent).toContain("Showing the last known history.");
    expect(view.all('ul[aria-label="Commits"] > li')).toHaveLength(1);
  });

  it("makes each commit row a programmatic focus target with a visible ring on keyboard focus", () => {
    const view = render(<CommitList state={LOADED} emptyMessage="none" />);
    const row = view.get('ul[aria-label="Commits"] > li');

    expect(row.getAttribute("tabindex")).toBe("-1");
    expect(row.className).toContain("focus-visible:outline-ring");
  });
});
