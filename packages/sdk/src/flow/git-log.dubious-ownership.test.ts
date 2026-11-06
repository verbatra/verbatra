import { describe, expect, it } from "vitest";
import type { GitExecFile } from "./git-exec.js";
import { LOCALE_HISTORY_UNAVAILABLE_REASONS, runGitLog } from "./git-log.js";

const DUBIOUS = Object.assign(new Error("git failed"), {
  code: 128,
  stderr: "fatal: detected dubious ownership in repository at '/project'\n",
});

describe("runGitLog and a repository owned by another user", () => {
  it("keeps reading it as an empty history, as it did before the shared failure mapping", async () => {
    const execFile: GitExecFile = async () => {
      throw DUBIOUS;
    };

    const result = await runGitLog({
      execFile,
      projectRoot: "/project",
      watchedPaths: ["/project/de.json"],
    });

    expect(result).toEqual({ available: true, commits: [] });
  });

  it("does not add a reason to the published history reasons", () => {
    expect(LOCALE_HISTORY_UNAVAILABLE_REASONS).toEqual([
      "git-missing",
      "not-a-repository",
      "timeout",
      "output-too-large",
    ]);
  });
});
