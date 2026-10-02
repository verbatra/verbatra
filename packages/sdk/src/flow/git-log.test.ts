import { execFile as execFileCb } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it, vi } from "vitest";
import {
  buildGitLogArgs,
  clampHistoryLimit,
  defaultGitExecFile,
  type GitExecFile,
  type GitExecFileResult,
  hasLeadingDash,
  isPathContained,
  LOCALE_HISTORY_LIMIT_CAP,
  LOCALE_HISTORY_LIMIT_DEFAULT,
  parseGitLogOutput,
  resolveWatchedPaths,
  runGitLog,
} from "./git-log.js";

const execFileAsync = promisify(execFileCb);

async function runGit(cwd: string, args: readonly string[]): Promise<void> {
  await execFileAsync("git", args as string[], { cwd });
}

interface TempGitRepo {
  readonly root: string;
  cleanup(): Promise<void>;
}

async function makeTempGitRepo(): Promise<TempGitRepo> {
  const root = await mkdtemp(join(tmpdir(), "verbatra-sdk-git-"));
  await runGit(root, ["init", "-q"]);
  await runGit(root, ["config", "user.email", "test@example.com"]);
  await runGit(root, ["config", "user.name", "Test User"]);
  return { root, cleanup: () => rm(root, { recursive: true, force: true }) };
}

async function commitFile(root: string, relativePath: string, content: string): Promise<void> {
  const absolutePath = join(root, relativePath);
  await writeFile(absolutePath, content, "utf8");
  await runGit(root, ["add", relativePath]);
  await runGit(root, ["commit", "-q", "-m", `write ${relativePath}`]);
}

describe("clampHistoryLimit", () => {
  it("defaults to 50 when no limit is given", () => {
    expect(clampHistoryLimit(undefined)).toBe(LOCALE_HISTORY_LIMIT_DEFAULT);
  });

  it("passes a limit under the cap through unchanged", () => {
    expect(clampHistoryLimit(10)).toBe(10);
  });

  it("clamps a limit above the cap down to 200", () => {
    expect(clampHistoryLimit(9999)).toBe(LOCALE_HISTORY_LIMIT_CAP);
  });

  it("clamps a limit exactly at the cap to itself", () => {
    expect(clampHistoryLimit(LOCALE_HISTORY_LIMIT_CAP)).toBe(LOCALE_HISTORY_LIMIT_CAP);
  });
});

describe("isPathContained", () => {
  it("accepts a path nested under the root", () => {
    expect(isPathContained("/project", "/project/locales/de.json")).toBe(true);
  });

  it("accepts the root itself", () => {
    expect(isPathContained("/project", "/project")).toBe(true);
  });

  it("rejects a sibling directory whose name merely shares the root as a prefix", () => {
    expect(isPathContained("/project", "/project-evil/locales/de.json")).toBe(false);
  });

  it("rejects a path entirely outside the root", () => {
    expect(isPathContained("/project", "/etc/passwd")).toBe(false);
  });

  it("tolerates a root with a trailing separator", () => {
    expect(isPathContained("/project/", "/project/locales/de.json")).toBe(true);
  });
});

describe("hasLeadingDash", () => {
  it("flags a path starting with a dash", () => {
    expect(hasLeadingDash("-x")).toBe(true);
  });

  it("does not flag an ordinary absolute path", () => {
    expect(hasLeadingDash("/project/locales/de.json")).toBe(false);
  });
});

describe("resolveWatchedPaths", () => {
  it("resolves relative candidates to absolute paths under the project root", () => {
    const resolved = resolveWatchedPaths("/project", ["locales/de.json"]);
    expect(resolved).toEqual(["/project/locales/de.json"]);
  });

  it("drops a candidate that escapes the project root", () => {
    const resolved = resolveWatchedPaths("/project", ["../outside/de.json", "locales/de.json"]);
    expect(resolved).toEqual(["/project/locales/de.json"]);
  });

  it("deduplicates candidates that resolve to the same absolute path", () => {
    const resolved = resolveWatchedPaths("/project", ["locales/de.json", "./locales/de.json"]);
    expect(resolved).toEqual(["/project/locales/de.json"]);
  });

  it("drops a raw candidate that starts with a dash before it is ever resolved", () => {
    const resolved = resolveWatchedPaths("/project", ["-x", "locales/de.json"]);
    expect(resolved).toEqual(["/project/locales/de.json"]);
  });
});

describe("buildGitLogArgs", () => {
  it("builds the exact argument array, never a shell string", () => {
    const args = buildGitLogArgs(50, ["/project/locales/de.json", "/project/locales/fr.json"]);

    expect(args).toEqual([
      "log",
      "--max-count=50",
      "--name-only",
      "-z",
      "--format=\x1e%H\x1f%aN\x1f%aI\x1f%s",
      "--",
      "/project/locales/de.json",
      "/project/locales/fr.json",
    ]);
  });

  it("places the -- sentinel immediately before the first path", () => {
    const args = buildGitLogArgs(50, ["/project/locales/de.json"]);
    const sentinelIndex = args.indexOf("--");

    expect(sentinelIndex).toBeGreaterThan(-1);
    expect(args[sentinelIndex + 1]).toBe("/project/locales/de.json");
  });

  it("never includes --follow", () => {
    const args = buildGitLogArgs(50, ["/project/locales/de.json"]);
    expect(args).not.toContain("--follow");
  });
});

describe("parseGitLogOutput", () => {
  it("returns an empty list for empty output", () => {
    expect(parseGitLogOutput("")).toEqual([]);
  });

  it("parses one commit touching two files", () => {
    const stdout =
      "\x1eabc123\x1fAda Lovelace\x1f2026-01-01T00:00:00+00:00\x1ffirst commit\0\na.json\0b.json\0";

    expect(parseGitLogOutput(stdout)).toEqual([
      {
        hash: "abc123",
        author: "Ada Lovelace",
        authorDate: "2026-01-01T00:00:00+00:00",
        subject: "first commit",
        touchedPaths: ["a.json", "b.json"],
      },
    ]);
  });

  it("parses multiple commits in newest-first order, each with its own file list", () => {
    const stdout =
      "\x1ehash2\x1fAda Lovelace\x1f2026-01-02T00:00:00+00:00\x1fsecond\0\na.json\0" +
      "\x1ehash1\x1fAda Lovelace\x1f2026-01-01T00:00:00+00:00\x1ffirst\0\na.json\0b.json\0";

    expect(parseGitLogOutput(stdout)).toEqual([
      {
        hash: "hash2",
        author: "Ada Lovelace",
        authorDate: "2026-01-02T00:00:00+00:00",
        subject: "second",
        touchedPaths: ["a.json"],
      },
      {
        hash: "hash1",
        author: "Ada Lovelace",
        authorDate: "2026-01-01T00:00:00+00:00",
        subject: "first",
        touchedPaths: ["a.json", "b.json"],
      },
    ]);
  });

  it("parses a commit with no touched files (no name-only block at all)", () => {
    const stdout = "\x1eabc\x1fAda Lovelace\x1f2026-01-01T00:00:00+00:00\x1fempty commit\0";

    expect(parseGitLogOutput(stdout)).toEqual([
      {
        hash: "abc",
        author: "Ada Lovelace",
        authorDate: "2026-01-01T00:00:00+00:00",
        subject: "empty commit",
        touchedPaths: [],
      },
    ]);
  });

  it("drops a record whose header does not have all three fields", () => {
    const stdout = "\x1eonly-hash\0\na.json\0";
    expect(parseGitLogOutput(stdout)).toEqual([]);
  });

  it("parses a record with no NUL at all as a header-only commit with no touched files", () => {
    const stdout = "\x1eabc\x1fAda Lovelace\x1f2026-01-01T00:00:00+00:00\x1fno trailing nul";

    expect(parseGitLogOutput(stdout)).toEqual([
      {
        hash: "abc",
        author: "Ada Lovelace",
        authorDate: "2026-01-01T00:00:00+00:00",
        subject: "no trailing nul",
        touchedPaths: [],
      },
    ]);
  });
});

type MockedExecFile = GitExecFile & { readonly mock: { readonly calls: readonly unknown[][] } };

function resolvedExecFile(stdout: string, stderr = ""): MockedExecFile {
  return vi.fn(
    async (): Promise<GitExecFileResult> => ({ stdout, stderr }),
  ) as unknown as MockedExecFile;
}

describe("runGitLog", () => {
  it("returns available: true with parsed commits on a successful invocation", async () => {
    const execFile = resolvedExecFile(
      "\x1eabc\x1fAda Lovelace\x1f2026-01-01T00:00:00+00:00\x1ffirst\0\na.json\0",
    );

    const result = await runGitLog({
      execFile,
      projectRoot: "/project",
      watchedPaths: ["/project/locales/de.json"],
    });

    expect(result).toEqual({
      available: true,
      commits: [
        {
          hash: "abc",
          author: "Ada Lovelace",
          authorDate: "2026-01-01T00:00:00+00:00",
          subject: "first",
          touchedPaths: ["a.json"],
        },
      ],
    });
  });

  it("runs execFile with cwd set to the project root", async () => {
    const execFile = resolvedExecFile("");

    await runGitLog({
      execFile,
      projectRoot: "/project",
      watchedPaths: ["/project/locales/de.json"],
    });

    expect(execFile).toHaveBeenCalledWith("git", expect.any(Array), { cwd: "/project" });
  });

  it("never invokes execFile when watchedPaths is empty", async () => {
    const execFile = resolvedExecFile("");

    const result = await runGitLog({ execFile, projectRoot: "/project", watchedPaths: [] });

    expect(result).toEqual({ available: true, commits: [] });
    expect(execFile).not.toHaveBeenCalled();
  });

  it("degrades to available: false when git itself is missing (ENOENT)", async () => {
    const execFile = vi.fn(async () => {
      const error = new Error("spawn git ENOENT") as NodeJS.ErrnoException;
      error.code = "ENOENT";
      throw error;
    }) as unknown as GitExecFile;

    const result = await runGitLog({
      execFile,
      projectRoot: "/project",
      watchedPaths: ["/project/locales/de.json"],
    });

    expect(result).toEqual({ available: false });
  });

  it("degrades to available: false when the directory is not a git repository", async () => {
    const execFile = vi.fn(async () => {
      const error = new Error("git log failed") as Error & { code?: number; stderr?: string };
      error.code = 128;
      error.stderr = "fatal: not a git repository (or any of the parent directories): .git\n";
      throw error;
    }) as unknown as GitExecFile;

    const result = await runGitLog({
      execFile,
      projectRoot: "/project",
      watchedPaths: ["/project/locales/de.json"],
    });

    expect(result).toEqual({ available: false });
  });

  it("degrades to available: true with an empty history for any other git failure, such as an unborn branch", async () => {
    const execFile = vi.fn(async () => {
      const error = new Error("git log failed") as Error & { code?: number; stderr?: string };
      error.code = 128;
      error.stderr = "fatal: your current branch 'main' does not have any commits yet\n";
      throw error;
    }) as unknown as GitExecFile;

    const result = await runGitLog({
      execFile,
      projectRoot: "/project",
      watchedPaths: ["/project/locales/de.json"],
    });

    expect(result).toEqual({ available: true, commits: [] });
  });

  it("clamps the limit before building the argument array", async () => {
    const execFile = resolvedExecFile("");

    await runGitLog({
      execFile,
      projectRoot: "/project",
      watchedPaths: ["/project/locales/de.json"],
      limit: 9999,
    });

    const args = execFile.mock.calls[0]?.[1] as readonly string[];
    expect(args).toContain(`--max-count=${LOCALE_HISTORY_LIMIT_CAP}`);
  });
});

describe("defaultGitExecFile", () => {
  it("runs a real command and returns its stdout, decoded as utf8", async () => {
    const project = await makeTempGitRepo();
    try {
      await commitFile(project.root, "a.json", '{"a":"b"}\n');

      const result = await defaultGitExecFile("git", ["log", "--max-count=1", "--format=%s"], {
        cwd: project.root,
      });

      expect(result.stdout.trim()).toBe("write a.json");
    } finally {
      await project.cleanup();
    }
  });

  it("rejects when the command does not exist", async () => {
    await expect(
      defaultGitExecFile("verbatra-nonexistent-binary-xyz", [], { cwd: process.cwd() }),
    ).rejects.toThrow();
  });
});

describe("runGitLog against a real temporary git repository", () => {
  it("returns the commit that touches the watched locale file, scoped to that path only", async () => {
    const project = await makeTempGitRepo();
    try {
      await mkdir(join(project.root, "locales"), { recursive: true });
      await commitFile(project.root, "locales/de.json", '{"greeting":"hallo"}\n');
      await commitFile(project.root, "other.txt", "unrelated\n");

      const result = await runGitLog({
        execFile: defaultGitExecFile,
        projectRoot: project.root,
        watchedPaths: [join(project.root, "locales", "de.json")],
      });

      expect(result.available).toBe(true);
      if (!result.available) {
        throw new Error("expected available: true");
      }
      expect(result.commits).toHaveLength(1);
      expect(result.commits[0]?.subject).toBe("write locales/de.json");
      expect(result.commits[0]?.touchedPaths).toEqual(["locales/de.json"]);
      expect(result.commits[0]?.author).toBe("Test User");
      expect(JSON.stringify(result)).not.toContain("test@example.com");
    } finally {
      await project.cleanup();
    }
  });

  it("returns available: true with an empty history for a locale file that has no commits yet", async () => {
    const project = await makeTempGitRepo();
    try {
      await commitFile(project.root, "other.txt", "unrelated\n");
      await mkdir(join(project.root, "locales"), { recursive: true });
      await writeFile(join(project.root, "locales", "de.json"), '{"greeting":"hallo"}\n', "utf8");

      const result = await runGitLog({
        execFile: defaultGitExecFile,
        projectRoot: project.root,
        watchedPaths: [join(project.root, "locales", "de.json")],
      });

      expect(result).toEqual({ available: true, commits: [] });
    } finally {
      await project.cleanup();
    }
  });

  it("degrades to available: false for a directory that is not a git repository at all", async () => {
    const root = await mkdtemp(join(tmpdir(), "verbatra-sdk-notrepo-"));
    try {
      const result = await runGitLog({
        execFile: defaultGitExecFile,
        projectRoot: root,
        watchedPaths: [join(root, "locales", "de.json")],
      });

      expect(result).toEqual({ available: false });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("returns available: true with the truncated history of a shallow clone, never an error", async () => {
    const source = await makeTempGitRepo();
    const cloneRoot = await mkdtemp(join(tmpdir(), "verbatra-sdk-shallow-"));
    try {
      await mkdir(join(source.root, "locales"), { recursive: true });
      await commitFile(source.root, "locales/de.json", '{"a":"1"}\n');
      await commitFile(source.root, "locales/de.json", '{"a":"2"}\n');
      await commitFile(source.root, "locales/de.json", '{"a":"3"}\n');

      await execFileAsync("git", ["clone", "--depth", "1", `file://${source.root}`, cloneRoot]);

      const result = await runGitLog({
        execFile: defaultGitExecFile,
        projectRoot: cloneRoot,
        watchedPaths: [join(cloneRoot, "locales", "de.json")],
      });

      expect(result.available).toBe(true);
      if (!result.available) {
        throw new Error("expected available: true");
      }
      expect(result.commits.length).toBeGreaterThan(0);
      expect(result.commits.length).toBeLessThan(3);
    } finally {
      await source.cleanup();
      await rm(cloneRoot, { recursive: true, force: true });
    }
  });
});
