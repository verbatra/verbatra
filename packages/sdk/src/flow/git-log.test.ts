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
  LOCALE_HISTORY_MAX_OUTPUT_BYTES,
  LOCALE_HISTORY_TIMEOUT_MS,
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

const HASH_A = "a".repeat(40);
const HASH_B = "b".repeat(40);
const DATE = "2026-01-01T00:00:00+00:00";

function header(hash: string, author: string, subject: string, date = DATE): string {
  return [hash, date, author, subject].join("\0");
}

describe("buildGitLogArgs", () => {
  it("builds the exact argument array, never a shell string", () => {
    const args = buildGitLogArgs(50, ["/project/locales/de.json", "/project/locales/fr.json"]);

    expect(args).toEqual([
      "-c",
      "core.quotePath=false",
      "log",
      "--no-show-signature",
      "--max-count=50",
      "--name-only",
      "--format=%H%x00%aI%x00%aN%x00%s",
      "--",
      "/project/locales/de.json",
      "/project/locales/fr.json",
    ]);
  });

  it("places the -- sentinel immediately before the first path", () => {
    const args = buildGitLogArgs(50, ["/project/locales/de.json"]);
    const sentinelIndex = args.indexOf("--");

    expect(args[sentinelIndex + 1]).toBe("/project/locales/de.json");
  });

  it("never includes --follow and never asks for an email", () => {
    const args = buildGitLogArgs(50, ["/project/locales/de.json"]);

    expect(args).not.toContain("--follow");
    expect(args.join(" ")).not.toMatch(/%a[eE]|%c[eE]/);
  });
});

describe("parseGitLogOutput", () => {
  it("returns an empty list for empty output", () => {
    expect(parseGitLogOutput("")).toEqual([]);
  });

  it("parses commits newest first, each with its own file list", () => {
    const stdout = `${header(HASH_B, "Ada", "second")}\n\na.json\n${header(HASH_A, "Bo", "first")}\n\na.json\nb.json\n`;

    expect(parseGitLogOutput(stdout)).toEqual([
      {
        hash: HASH_B,
        author: "Ada",
        authorDate: DATE,
        subject: "second",
        touchedPaths: ["a.json"],
      },
      {
        hash: HASH_A,
        author: "Bo",
        authorDate: DATE,
        subject: "first",
        touchedPaths: ["a.json", "b.json"],
      },
    ]);
  });

  it("accepts a 64-character SHA-256 hash", () => {
    const hash = "c".repeat(64);

    expect(parseGitLogOutput(`${header(hash, "Ada", "x")}\n`)[0]?.hash).toBe(hash);
  });

  it("parses a commit with no touched files", () => {
    expect(parseGitLogOutput(header(HASH_A, "Ada", "empty"))).toEqual([
      { hash: HASH_A, author: "Ada", authorDate: DATE, subject: "empty", touchedPaths: [] },
    ]);
  });

  it.each([
    ["a short hash", header("abc", "Ada", "x")],
    ["an uppercase hash", header("A".repeat(40), "Ada", "x")],
    ["a date that is not ISO 8601", header(HASH_A, "Ada", "x", "yesterday")],
    ["an extra field", `${header(HASH_A, "Ada", "x")}\0${HASH_B}`],
    ["a missing field", [HASH_A, DATE, "Ada"].join("\0")],
  ])("drops a record with %s, and its paths with it", (_label, line) => {
    const stdout = `${line}\n\nforged.json\n${header(HASH_B, "Bo", "real")}\n\na.json\n`;

    expect(parseGitLogOutput(stdout)).toEqual([
      { hash: HASH_B, author: "Bo", authorDate: DATE, subject: "real", touchedPaths: ["a.json"] },
    ]);
  });

  it("removes control and bidirectional formatting characters from the author and subject", () => {
    const stdout = header(HASH_A, "Ada\x1e\u202eLovelace", "fix\x1f\u2066 de\x07");

    expect(parseGitLogOutput(stdout)[0]).toMatchObject({
      author: "AdaLovelace",
      subject: "fix de",
    });
  });

  it("unquotes a C-quoted path", () => {
    const stdout = `${header(HASH_A, "Ada", "x")}\n\n"l/x\\ny\\303\\244.json"\n`;

    expect(parseGitLogOutput(stdout)[0]?.touchedPaths).toEqual(["l/x\nyä.json"]);
  });

  it("unquotes the named escapes of a C-quoted path", () => {
    const stdout = `${header(HASH_A, "Ada", "x")}\n\n"a\\tb\\"c\\\\d"\n`;

    expect(parseGitLogOutput(stdout)[0]?.touchedPaths).toEqual(['a\tb"c\\d']);
  });
});

type MockedExecFile = GitExecFile & { readonly mock: { readonly calls: readonly unknown[][] } };

function resolvedExecFile(stdout: string, stderr = ""): MockedExecFile {
  return vi.fn(
    async (): Promise<GitExecFileResult> => ({ stdout, stderr }),
  ) as unknown as MockedExecFile;
}

function failingExecFile(failure: Record<string, unknown>): GitExecFile {
  return vi.fn(async () => {
    throw Object.assign(new Error("git log failed"), failure);
  }) as unknown as GitExecFile;
}

const WATCHED = ["/project/locales/de.json"];

describe("runGitLog", () => {
  it("returns available: true with parsed commits on a successful invocation", async () => {
    const execFile = resolvedExecFile(`${header(HASH_A, "Ada", "first")}\n\na.json\n`);

    const result = await runGitLog({ execFile, projectRoot: "/project", watchedPaths: WATCHED });

    expect(result).toEqual({
      available: true,
      commits: [
        {
          hash: HASH_A,
          author: "Ada",
          authorDate: DATE,
          subject: "first",
          touchedPaths: ["a.json"],
        },
      ],
    });
  });

  it("runs git in the project root with a timeout and an output limit", async () => {
    const execFile = resolvedExecFile("");

    await runGitLog({ execFile, projectRoot: "/project", watchedPaths: WATCHED });

    expect(execFile).toHaveBeenCalledWith("git", expect.any(Array), {
      cwd: "/project",
      timeout: LOCALE_HISTORY_TIMEOUT_MS,
      maxBuffer: LOCALE_HISTORY_MAX_OUTPUT_BYTES,
    });
  });

  it("never invokes execFile when watchedPaths is empty", async () => {
    const execFile = resolvedExecFile("");

    const result = await runGitLog({ execFile, projectRoot: "/project", watchedPaths: [] });

    expect(result).toEqual({ available: true, commits: [] });
    expect(execFile).not.toHaveBeenCalled();
  });

  it.each([
    ["git-missing", { code: "ENOENT" }],
    ["not-a-repository", { code: 128, stderr: "fatal: not a git repository (or any parent)\n" }],
    ["timeout", { killed: true, signal: "SIGTERM", code: null }],
    ["output-too-large", { code: "ERR_CHILD_PROCESS_STDIO_MAXBUFFER" }],
  ])("reports available: false with reason %s", async (reason, failure) => {
    const result = await runGitLog({
      execFile: failingExecFile(failure),
      projectRoot: "/project",
      watchedPaths: WATCHED,
    });

    expect(result).toEqual({ available: false, reason });
  });

  it("reads any other git failure, such as an unborn branch, as an empty history", async () => {
    const result = await runGitLog({
      execFile: failingExecFile({
        code: 128,
        stderr: "fatal: your current branch 'main' does not have any commits yet\n",
      }),
      projectRoot: "/project",
      watchedPaths: WATCHED,
    });

    expect(result).toEqual({ available: true, commits: [] });
  });

  it("reads a thrown non-object as an empty history", async () => {
    const execFile: GitExecFile = async () => {
      throw undefined;
    };

    const result = await runGitLog({ execFile, projectRoot: "/project", watchedPaths: WATCHED });

    expect(result).toEqual({ available: true, commits: [] });
  });

  it("clamps the limit before building the argument array", async () => {
    const execFile = resolvedExecFile("");

    await runGitLog({ execFile, projectRoot: "/project", watchedPaths: WATCHED, limit: 9999 });

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
        timeout: 10_000,
        maxBuffer: 1024 * 1024,
      });

      expect(result.stdout.trim()).toBe("write a.json");
    } finally {
      await project.cleanup();
    }
  });

  it("rejects when the command does not exist", async () => {
    await expect(
      defaultGitExecFile("verbatra-nonexistent-binary-xyz", [], {
        cwd: process.cwd(),
        timeout: 10_000,
        maxBuffer: 1024,
      }),
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

      expect(result).toEqual({ available: false, reason: "not-a-repository" });
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

async function gitOutput(cwd: string, args: readonly string[], input?: string): Promise<string> {
  const child = execFileCb("git", args as string[], { cwd });
  const output = new Promise<string>((resolveOutput, reject) => {
    let stdout = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", () => resolveOutput(stdout.trim()));
  });
  child.stdin?.end(input ?? "");
  return output;
}

async function commitRawMessage(root: string, path: string, message: string): Promise<void> {
  await writeFile(join(root, path), `${message.length}\n`, "utf8");
  await runGit(root, ["add", path]);
  const tree = await gitOutput(root, ["write-tree"]);
  const parent = await gitOutput(root, ["rev-parse", "HEAD"]);
  const body =
    `tree ${tree}\nparent ${parent}\n` +
    "author Mallory\x1f <m@example.com> 1767225600 +0000\n" +
    "committer Mallory <m@example.com> 1767225600 +0000\n\n" +
    `${message}\n`;
  const hash = await gitOutput(
    root,
    ["hash-object", "-t", "commit", "-w", "--literally", "--stdin"],
    body,
  );
  await runGit(root, ["update-ref", "HEAD", hash]);
}

describe("runGitLog against crafted commit metadata", () => {
  it("never forges a commit from separators in a subject or author", async () => {
    const project = await makeTempGitRepo();
    try {
      await mkdir(join(project.root, "locales"), { recursive: true });
      await commitFile(project.root, "locales/de.json", "1\n");
      const fake = `${"f".repeat(40)}\x1f2020-01-01T00:00:00+00:00\x1fForged\x1fforged\x1e`;
      await commitRawMessage(project.root, "locales/de.json", `evil \x1e${fake}‮ end`);
      await commitRawMessage(
        project.root,
        "locales/de.json",
        `nul\0${"e".repeat(40)}\0${DATE}\0Eve\0x`,
      );

      const result = await runGitLog({
        execFile: defaultGitExecFile,
        projectRoot: project.root,
        watchedPaths: [join(project.root, "locales", "de.json")],
      });

      if (!result.available) {
        throw new Error("expected available: true");
      }
      const authors = result.commits.map((commit) => commit.author);
      expect(authors).not.toContain("Forged");
      expect(authors).not.toContain("Eve");
      expect(result.commits.every((commit) => /^[0-9a-f]{40}$/.test(commit.hash))).toBe(true);
      expect(result.commits.some((commit) => commit.hash === "f".repeat(40))).toBe(false);
      const evil = result.commits.find((commit) => commit.subject.startsWith("evil"));
      expect(evil?.author).toBe("Mallory");
      for (const forbidden of ["\x1e", "\x1f", "\u202e"]) {
        expect(evil?.subject).not.toContain(forbidden);
      }
      expect(evil?.touchedPaths).toEqual(["locales/de.json"]);
      expect(result.commits.at(-1)?.subject).toBe("write locales/de.json");
    } finally {
      await project.cleanup();
    }
  });
});

describe("runGitLog with the real runner under tight limits", () => {
  it("reports output-too-large when git writes more than the buffer allows", async () => {
    const project = await makeTempGitRepo();
    try {
      await commitFile(project.root, "a.json", "1\n");
      const execFile: GitExecFile = (file, args, options) =>
        defaultGitExecFile(file, args, { ...options, maxBuffer: 8 });

      const result = await runGitLog({
        execFile,
        projectRoot: project.root,
        watchedPaths: [join(project.root, "a.json")],
      });

      expect(result).toEqual({ available: false, reason: "output-too-large" });
    } finally {
      await project.cleanup();
    }
  });

  it("reports timeout when git runs longer than allowed", async () => {
    const project = await makeTempGitRepo();
    try {
      await commitFile(project.root, "a.json", "1\n");
      const execFile: GitExecFile = (_file, _args, options) =>
        defaultGitExecFile("sh", ["-c", "sleep 5"], { ...options, timeout: 50 });

      const result = await runGitLog({
        execFile,
        projectRoot: project.root,
        watchedPaths: [join(project.root, "a.json")],
      });

      expect(result).toEqual({ available: false, reason: "timeout" });
    } finally {
      await project.cleanup();
    }
  });
});
