export type CommitTimes = Readonly<Record<string, number>>;

export type GitRunner = (args: readonly string[]) => string;

export type CommitTimesStore = {
  exists: () => boolean;
  write: (times: CommitTimes) => void;
};

export type CommitTimesSync = "written" | "kept" | "empty";

const COMMIT_MARKER = "\u0000";

const LOG_ARGS = [
  "-c",
  "core.quotePath=false",
  "log",
  "--format=%x00%ct",
  "--name-only",
  "--relative",
  "--",
  ".",
] as const;

export function parseCommitLog(log: string): CommitTimes {
  const times: Record<string, number> = {};
  for (const commit of log.split(COMMIT_MARKER)) {
    const [stamp, ...files] = commit.split("\n");
    const time = Number(stamp);
    if (!Number.isInteger(time)) continue;
    for (const file of files) {
      if (file === "") continue;
      times[file] = Math.max(times[file] ?? 0, time);
    }
  }
  return times;
}

const TRACKED_ARGS = ["-c", "core.quotePath=false", "ls-files", "--", "."] as const;

function onlyTracked(times: CommitTimes, tracked: string): CommitTimes {
  const files = new Set(tracked.split("\n").filter((file) => file !== ""));
  return Object.fromEntries(Object.entries(times).filter(([file]) => files.has(file)));
}

export function readCommitTimes(git: GitRunner): CommitTimes | undefined {
  try {
    if (git(["rev-parse", "--is-shallow-repository"]).trim() !== "false") return undefined;
    return onlyTracked(parseCommitLog(git(LOG_ARGS)), git(TRACKED_ARGS));
  } catch {
    return undefined;
  }
}

export function syncCommitTimes(git: GitRunner, store: CommitTimesStore): CommitTimesSync {
  const times = readCommitTimes(git);
  if (times !== undefined) {
    store.write(times);
    return "written";
  }
  if (store.exists()) return "kept";
  store.write({});
  return "empty";
}
