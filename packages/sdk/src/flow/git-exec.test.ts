import { execFile as execFileCb } from "node:child_process";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildSafeGitArgs,
  classifyGitFailure,
  createGitRunner,
  defaultGitExecFile,
  type GitExecFile,
  sanitizeGitText,
} from "./git-exec.js";

const execFileAsync = promisify(execFileCb);

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("buildSafeGitArgs", () => {
  it("puts the safety flags first and the caller's arguments last", () => {
    expect(buildSafeGitArgs(["-c", "filter.x.clean="], ["status", "--", "a.json"])).toEqual([
      "--no-optional-locks",
      "--literal-pathspecs",
      "-c",
      "core.fsmonitor=false",
      "-c",
      "filter.x.clean=",
      "status",
      "--",
      "a.json",
    ]);
  });
});

describe("classifyGitFailure", () => {
  it.each([
    ["git-missing", { code: "ENOENT" }],
    ["output-too-large", { code: "ERR_CHILD_PROCESS_STDIO_MAXBUFFER" }],
    ["timeout", { killed: true, signal: "SIGTERM", code: null }],
    ["timeout", { signal: "SIGTERM" }],
    ["not-a-repository", { code: 128, stderr: "fatal: not a git repository (or any of the" }],
    ["not-a-repository", { code: 128, stderr: "fatal: this operation must be run in a work tree" }],
    ["dubious-ownership", { code: 128, stderr: "fatal: detected dubious ownership in repository" }],
    ["git-failed", { code: 128, stderr: "fatal: something else" }],
    ["git-failed", { code: 1 }],
  ])("reads %s", (kind, failure) => {
    expect(classifyGitFailure(Object.assign(new Error("x"), failure)).kind).toBe(kind);
  });

  it("reads a thrown non-object as an unclassified failure", () => {
    expect(classifyGitFailure(undefined)).toEqual({
      kind: "git-failed",
      exitCode: undefined,
      stderr: "",
    });
  });

  it("carries the exit code and stderr", () => {
    const failure = classifyGitFailure(Object.assign(new Error("x"), { code: 1, stderr: "e" }));

    expect(failure).toEqual({ kind: "git-failed", exitCode: 1, stderr: "e" });
  });
});

describe("createGitRunner", () => {
  it("runs git in the cwd with the default limits and the safe prefix", async () => {
    const execFile = vi.fn(async () => ({ stdout: "out", stderr: "" }));
    const runner = createGitRunner(execFile as unknown as GitExecFile, "/project", ["-c", "a.b=c"]);

    const result = await runner.run(["rev-parse", "HEAD"]);

    expect(result).toEqual({ ok: true, stdout: "out" });
    expect(execFile).toHaveBeenCalledWith(
      "git",
      buildSafeGitArgs(["-c", "a.b=c"], ["rev-parse", "HEAD"]),
      { cwd: "/project", timeout: 10_000, maxBuffer: 1_048_576 },
    );
  });

  it("passes the caller's limits through", async () => {
    const execFile = vi.fn(async (..._args: unknown[]) => ({ stdout: "", stderr: "" }));

    await createGitRunner(execFile as unknown as GitExecFile, "/p").run(["x"], {
      timeout: 5,
      maxBuffer: 7,
    });

    expect(execFile.mock.calls[0]?.[2]).toEqual({ cwd: "/p", timeout: 5, maxBuffer: 7 });
  });

  it("returns a structured failure instead of throwing", async () => {
    const execFile: GitExecFile = async () => {
      throw Object.assign(new Error("x"), { code: "ENOENT" });
    };

    const result = await createGitRunner(execFile, "/p").run(["x"]);

    expect(result).toEqual({
      ok: false,
      failure: { kind: "git-missing", exitCode: undefined, stderr: "" },
    });
  });
});

describe("createGitRunner with the real runner under tight limits", () => {
  it("reports output-too-large when git writes more than the buffer allows", async () => {
    const result = await createGitRunner(defaultGitExecFile, tmpdir()).run(["--version"], {
      maxBuffer: 2,
    });

    expect(result).toMatchObject({ ok: false, failure: { kind: "output-too-large" } });
  });

  it("reports timeout when the process outlives its limit", async () => {
    const slow: GitExecFile = (_file, _args, options) =>
      defaultGitExecFile("sh", ["-c", "sleep 5"], { ...options, timeout: 50 });

    const result = await createGitRunner(slow, tmpdir()).run(["--version"]);

    expect(result).toMatchObject({ ok: false, failure: { kind: "timeout" } });
  });
});

describe("defaultGitExecFile environment", () => {
  it("forces the C locale so failure messages can be matched", async () => {
    vi.stubEnv("LC_ALL", "de_DE.UTF-8");
    const dir = await mkdtemp(join(tmpdir(), "verbatra-sdk-exec-"));
    try {
      const result = await defaultGitExecFile("sh", ["-c", 'printf %s "$LC_ALL"'], {
        cwd: dir,
        timeout: 5000,
        maxBuffer: 1024,
      });

      expect(result.stdout).toBe("C");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("disables terminal prompts", async () => {
    const result = await defaultGitExecFile("sh", ["-c", 'printf %s "$GIT_TERMINAL_PROMPT"'], {
      cwd: tmpdir(),
      timeout: 5000,
      maxBuffer: 1024,
    });

    expect(result.stdout).toBe("0");
  });
});

describe("sanitizeGitText", () => {
  it("removes control and bidirectional formatting characters", () => {
    expect(sanitizeGitText("a\u0000b\u202Ec\u200Fd\ne")).toBe("abcde");
  });
});

describe("git status runs repository-configured commands unless they are neutralised", () => {
  async function git(cwd: string, args: readonly string[]): Promise<void> {
    await execFileAsync("git", args as string[], { cwd });
  }

  async function exists(path: string): Promise<boolean> {
    try {
      await stat(path);
      return true;
    } catch {
      return false;
    }
  }

  async function hostileRepo(): Promise<{ base: string; root: string; marker: string }> {
    const base = await mkdtemp(join(tmpdir(), "verbatra-sdk-fsmonitor-"));
    const root = join(base, "repo");
    const marker = join(base, "marker");
    const script = join(base, "hook.sh");
    await mkdir(root);
    await git(root, ["init", "-q"]);
    await git(root, ["config", "user.email", "t@example.com"]);
    await git(root, ["config", "user.name", "T"]);
    await writeFile(join(root, "de.json"), "{}\n");
    await git(root, ["add", "."]);
    await git(root, ["commit", "-q", "-m", "init"]);
    await writeFile(script, `#!/bin/sh\necho ran >> "${marker}"\nprintf '\\0'\n`, { mode: 0o755 });
    await git(root, ["config", "core.fsmonitor", script]);
    return { base, root, marker };
  }

  it("runs a repository fsmonitor hook on a plain status", async () => {
    const { base, root, marker } = await hostileRepo();
    try {
      await execFileAsync("git", ["status", "--porcelain"], { cwd: root });

      expect(await exists(marker)).toBe(true);
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  it("does not run it through the runner", async () => {
    const { base, root, marker } = await hostileRepo();
    try {
      const result = await createGitRunner(defaultGitExecFile, root).run([
        "status",
        "--porcelain=v1",
        "-z",
      ]);

      expect(result.ok).toBe(true);
      expect(await exists(marker)).toBe(false);
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });
});
