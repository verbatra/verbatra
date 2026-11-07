import { describe, expect, it } from "vitest";
import type { GitExecFile } from "./git-exec.js";
import { LOCALE_HISTORY_UNAVAILABLE_REASONS, runGitLog } from "./git-log.js";
import { LOCALE_GIT_UNAVAILABLE_REASONS } from "./git-worktree.js";

const DUBIOUS = Object.assign(new Error("git failed"), {
  code: 128,
  stderr: "fatal: detected dubious ownership in repository at '/project'\n",
});

describe("runGitLog and a repository owned by another user", () => {
  it("says so instead of reading it as an empty history", async () => {
    const execFile: GitExecFile = async () => {
      throw DUBIOUS;
    };

    const result = await runGitLog({
      execFile,
      projectRoot: "/project",
      watchedPaths: ["/project/de.json"],
    });

    expect(result).toEqual({ available: false, reason: "dubious-ownership" });
  });

  it("gives every repository reason the git status and diff calls give", () => {
    const repositoryReasons = LOCALE_GIT_UNAVAILABLE_REASONS.filter(
      (reason) =>
        ![
          "git-failed",
          "custom-adapter",
          "revision-unreadable",
          "working-file-unreadable",
          "outside-project",
        ].includes(reason),
    );

    expect([...LOCALE_HISTORY_UNAVAILABLE_REASONS].sort()).toEqual([...repositoryReasons].sort());
  });
});
