import { describe, expect, it } from "vitest";
import {
  type CommitTimes,
  type GitRunner,
  parseCommitLog,
  readCommitTimes,
  syncCommitTimes,
} from "./commit-times";

const LOG = [
  "\u0000300",
  "",
  "(guides)/review.mdx",
  "\u0000200",
  "",
  "(guides)/review.mdx",
  "(guides)/review.de.mdx",
  "(guides)/moved.mdx",
  "\u0000100",
  "",
  "(guides)/review.de.mdx",
  "",
].join("\n");

const TRACKED = "(guides)/review.mdx\n(guides)/review.de.mdx\n";

function fakeGit(shallow: string): GitRunner {
  return (args) => {
    if (args.includes("rev-parse")) return `${shallow}\n`;
    if (args.includes("ls-files")) return TRACKED;
    return LOG;
  };
}

const failingGit: GitRunner = () => {
  throw new Error("spawnSync git ENOENT");
};

function memoryStore(initial?: CommitTimes) {
  const store = {
    saved: initial,
    exists: () => store.saved !== undefined,
    write: (times: CommitTimes) => {
      store.saved = times;
    },
  };
  return store;
}

describe("parseCommitLog", () => {
  it("keeps the newest commit time of every file", () => {
    expect(parseCommitLog(LOG)).toEqual({
      "(guides)/review.mdx": 300,
      "(guides)/review.de.mdx": 200,
      "(guides)/moved.mdx": 200,
    });
  });

  it("returns nothing for an empty log", () => {
    expect(parseCommitLog("")).toEqual({});
  });
});

describe("readCommitTimes", () => {
  it("drops files that are no longer tracked", () => {
    expect(readCommitTimes(fakeGit("false"))).toEqual({
      "(guides)/review.mdx": 300,
      "(guides)/review.de.mdx": 200,
    });
  });

  it("refuses a shallow clone, whose history would make every file look equally new", () => {
    expect(readCommitTimes(fakeGit("true"))).toBeUndefined();
  });

  it("returns nothing when git is missing or the directory is not a repository", () => {
    expect(readCommitTimes(failingGit)).toBeUndefined();
  });
});

describe("syncCommitTimes", () => {
  it("writes the times read from a full history", () => {
    const store = memoryStore({ stale: 1 });
    expect(syncCommitTimes(fakeGit("false"), store)).toBe("written");
    expect(store.saved).toEqual({ "(guides)/review.mdx": 300, "(guides)/review.de.mdx": 200 });
  });

  it("keeps a snapshot taken earlier when this build has no history, as in the Docker build", () => {
    const store = memoryStore({ "(guides)/review.mdx": 300 });
    expect(syncCommitTimes(failingGit, store)).toBe("kept");
    expect(store.saved).toEqual({ "(guides)/review.mdx": 300 });
  });

  it("writes an empty snapshot when there is neither history nor an earlier snapshot", () => {
    const store = memoryStore();
    expect(syncCommitTimes(fakeGit("true"), store)).toBe("empty");
    expect(store.saved).toEqual({});
  });
});
