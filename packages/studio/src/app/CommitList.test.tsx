// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
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

    expect(view.all("ul:not([aria-label]) > li")).toHaveLength(2);
  });

  it("shows the commit subject as the row's lead line", () => {
    const view = render(<CommitList state={LOADED} emptyMessage="none" />);

    expect(view.get("li p").textContent).toBe("chore(i18n): sync de and fr");
  });

  it("shortens the hash to the conventional seven characters", () => {
    const view = render(<CommitList state={LOADED} emptyMessage="none" />);

    expect(view.getByText("span", "0123456")).not.toBeNull();
  });

  it("shows the calendar date and keeps the full ISO author date as the hover title", () => {
    const view = render(<CommitList state={LOADED} emptyMessage="none" />);
    const dateLabel = view.getByText("span", "2026-07-18");

    expect(dateLabel.getAttribute("title")).toBe("2026-07-18T09:41:12+02:00");
  });

  it("names the commit author after the date, so only the name wraps", () => {
    const view = render(<CommitList state={LOADED} emptyMessage="none" />);
    const spans = [...view.get("li p + p").querySelectorAll("span")].map(
      (span) => span.textContent,
    );

    expect(spans).toEqual(["0123456", "2026-07-18", "Ada Lovelace"]);
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
    expect(view.get("li p").textContent).toBe("<img src=x onerror=alert(1)>");
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
});
