import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import githubChangelog from "@changesets/changelog-github";
import { describe, expect, it } from "vitest";
import changelog, { uniqueByCommit, withUniqueCommits } from "./changelog-unique-commits.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CHANGESET_CONFIG = JSON.parse(
  readFileSync(resolve(REPO_ROOT, ".changeset/config.json"), "utf8"),
);

const SHARED_COMMIT = "08abfe3000000000000000000000000000000000";
const CHANGESETS = [
  { id: "packaging", summary: "Packaging", releases: [], commit: SHARED_COMMIT },
  { id: "doctor", summary: "Doctor", releases: [], commit: SHARED_COMMIT },
  { id: "studio", summary: "Studio", releases: [], commit: SHARED_COMMIT },
  { id: "uncommitted", summary: "Uncommitted", releases: [] },
];
const DEPENDENCIES = [{ name: "@verbatra/sdk", newVersion: "0.12.0" }];
const OPTIONS = { repo: "verbatra/verbatra" };

function fakeChangelog() {
  return {
    getReleaseLine: async (changeset) => `release ${changeset.id}`,
    getDependencyReleaseLine: async (changesets) =>
      `- Updated dependencies [${changesets
        .filter((changeset) => changeset.commit)
        .map((changeset) => `\`${changeset.commit.slice(0, 7)}\``)
        .join(", ")}]`,
  };
}

describe("changelog-unique-commits: uniqueByCommit", () => {
  it("keeps one changeset per commit and keys an uncommitted one by its id", () => {
    expect(uniqueByCommit(CHANGESETS).map((changeset) => changeset.id)).toEqual([
      "packaging",
      "uncommitted",
    ]);
  });

  it("keeps uncommitted changesets with different ids apart", () => {
    const uncommitted = [
      { id: "a", summary: "", releases: [] },
      { id: "b", summary: "", releases: [] },
    ];
    expect(uniqueByCommit(uncommitted)).toEqual(uncommitted);
  });
});

describe("changelog-unique-commits: delegation", () => {
  it("links a commit shared by several changesets once in the dependency line", async () => {
    const calls = [];
    const base = fakeChangelog();
    const wrapped = withUniqueCommits({
      ...base,
      getDependencyReleaseLine: (changesets, dependencies, options) => {
        calls.push({ changesets, dependencies, options });
        return base.getDependencyReleaseLine(changesets, dependencies, options);
      },
    });

    const line = await wrapped.getDependencyReleaseLine(CHANGESETS, DEPENDENCIES, OPTIONS);

    expect(line).toBe("- Updated dependencies [`08abfe3`]");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.changesets).toHaveLength(2);
    expect(calls[0]?.dependencies).toBe(DEPENDENCIES);
    expect(calls[0]?.options).toBe(OPTIONS);
  });

  it("passes the release line through unchanged", async () => {
    const base = fakeChangelog();
    const wrapped = withUniqueCommits(base);

    expect(wrapped.getReleaseLine).toBe(base.getReleaseLine);
    expect(await wrapped.getReleaseLine(CHANGESETS[0], "minor", OPTIONS)).toBe("release packaging");
  });

  it("wraps the GitHub changelog by default", () => {
    expect(changelog.getReleaseLine).toBe(githubChangelog.getReleaseLine);
    expect(changelog.getDependencyReleaseLine).not.toBe(githubChangelog.getDependencyReleaseLine);
  });
});

describe("changelog-unique-commits: changeset config", () => {
  it("is the changelog generator the changeset config points at", () => {
    expect(CHANGESET_CONFIG.changelog).toEqual([
      "../scripts/changelog-unique-commits.mjs",
      { repo: "verbatra/verbatra" },
    ]);
  });
});
