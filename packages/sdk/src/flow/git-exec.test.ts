import { execFile as execFileCb } from "node:child_process";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeGitFixture } from "../test-support.js";
import {
  buildSafeGitArgs,
  classifyGitFailure,
  createGitRunner,
  defaultGitExecFile,
  type GitExecFile,
  hardenedGitEnv,
  isPathContained,
  planGitConfig,
  prepareGit,
  SAFE_GIT_PREFIX,
  sanitizeGitText,
} from "./git-exec.js";

const execFileAsync = promisify(execFileCb);

afterEach(() => {
  vi.unstubAllEnvs();
});

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

describe("buildSafeGitArgs", () => {
  it("puts the safety flags first and the caller's arguments last", () => {
    expect(SAFE_GIT_PREFIX).toEqual([
      "--no-optional-locks",
      "--literal-pathspecs",
      "-c",
      "core.fsmonitor=false",
      "-c",
      "safe.bareRepository=explicit",
    ]);
    expect(buildSafeGitArgs(["-c", "filter.x.clean="], ["status", "--", "a.json"])).toEqual([
      ...SAFE_GIT_PREFIX,
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
    ["timeout", { signal: "SIGKILL" }],
    ["not-a-repository", { code: 128, stderr: "fatal: not a git repository (or any of the" }],
    ["not-a-repository", { code: 128, stderr: "fatal: this operation must be run in a work tree" }],
    ["dubious-ownership", { code: 128, stderr: "fatal: detected dubious ownership in repository" }],
    [
      "bare-repository",
      {
        code: 128,
        stderr: "fatal: cannot use bare repository '/x' (safe.bareRepository is 'explicit')",
      },
    ],
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

  it("kills a process that ignores the polite signal", async () => {
    const stubborn: GitExecFile = (_file, _args, options) =>
      defaultGitExecFile("sh", ["-c", "trap '' TERM; exec sleep 6"], { ...options, timeout: 100 });
    const started = Date.now();

    const result = await createGitRunner(stubborn, tmpdir()).run(["--version"]);

    expect(result).toMatchObject({ ok: false, failure: { kind: "timeout" } });
    expect(Date.now() - started).toBeLessThan(3000);
  });

  it("proves the polite signal alone leaves that process running", async () => {
    const started = Date.now();

    await execFileAsync("sh", ["-c", "trap '' TERM; exec sleep 2"], { timeout: 100 }).catch(
      () => undefined,
    );

    expect(Date.now() - started).toBeGreaterThanOrEqual(1500);
  });
});

describe("hardenedGitEnv", () => {
  it("keeps only the allow-listed variables, whatever their case, and no GIT_ variable", () => {
    const env = hardenedGitEnv({
      PATH: "/bin",
      Path: "C:\\bin",
      HOME: "/home/x",
      GIT_DIR: "/evil",
      GIT_CONFIG_COUNT: "1",
      GIT_EXEC_PATH: "/evil",
      LD_PRELOAD: "/evil.so",
      NODE_OPTIONS: "--require /evil.js",
      SECRET_TOKEN: "t",
    });

    expect(env).toEqual({
      PATH: "/bin",
      Path: "C:\\bin",
      HOME: "/home/x",
      GIT_TERMINAL_PROMPT: "0",
      GIT_NO_LAZY_FETCH: "1",
      LC_ALL: "C",
    });
  });

  it("lets a caller add variables on top, for a runner of its own", () => {
    expect(hardenedGitEnv({}, { HOME: "/h" })).toMatchObject({ HOME: "/h", LC_ALL: "C" });
  });

  it("reaches the git process: no GIT_ variable, a C locale, no prompts, no lazy fetch", async () => {
    vi.stubEnv("GIT_DIR", "/evil");
    vi.stubEnv("GIT_CONFIG_COUNT", "1");
    vi.stubEnv("LC_ALL", "de_DE.UTF-8");
    vi.stubEnv("NODE_OPTIONS", "");

    const { stdout } = await defaultGitExecFile("sh", ["-c", "env"], {
      cwd: tmpdir(),
      timeout: 5000,
      maxBuffer: 65_536,
    });
    const names = stdout.split("\n").map((line) => line.split("=")[0]);

    expect(names).not.toContain("GIT_DIR");
    expect(names).not.toContain("GIT_CONFIG_COUNT");
    expect(stdout).toContain("LC_ALL=C\n");
    expect(stdout).toContain("GIT_TERMINAL_PROMPT=0\n");
    expect(stdout).toContain("GIT_NO_LAZY_FETCH=1\n");
  });
});

describe("an inherited GIT_DIR cannot steer the runner", () => {
  it("steers a plain git, not the runner", async () => {
    const fx = await makeGitFixture();
    try {
      await fx.write("de.json", "{}\n");
      await fx.commitAll();
      const project = join(fx.base, "plain");
      await mkdir(project);
      const steering = {
        ...process.env,
        GIT_DIR: join(fx.root, ".git"),
        GIT_WORK_TREE: project,
      };
      const plain = await execFileAsync("git", ["rev-parse", "--is-inside-work-tree"], {
        cwd: project,
        env: steering,
      });
      vi.stubEnv("GIT_DIR", join(fx.root, ".git"));
      vi.stubEnv("GIT_WORK_TREE", project);

      const guarded = await createGitRunner(defaultGitExecFile, project).run([
        "rev-parse",
        "--is-inside-work-tree",
      ]);

      expect(plain.stdout.trim()).toBe("true");
      expect(guarded).toMatchObject({ ok: false, failure: { kind: "not-a-repository" } });
    } finally {
      await fx.cleanup();
    }
  });
});

describe("the ownership check and the host's git configuration", () => {
  it("is bypassed by a system config naming every directory safe, unless the system config is off", async () => {
    const fx = await makeGitFixture();
    try {
      await fx.write("de.json", "{}\n");
      await fx.commitAll();
      const system = join(fx.base, "system.gitconfig");
      await writeFile(system, "[safe]\n\tdirectory = *\n");
      const env = {
        PATH: process.env.PATH ?? "",
        HOME: fx.home,
        GIT_TEST_ASSUME_DIFFERENT_OWNER: "1",
      };

      const bypassed = await execFileAsync("git", ["status", "--porcelain"], {
        cwd: fx.root,
        env: { ...env, GIT_CONFIG_SYSTEM: system },
      }).then(
        () => "accepted",
        () => "refused",
      );
      const isolated = await execFileAsync("git", ["status", "--porcelain"], {
        cwd: fx.root,
        env: { ...env, GIT_CONFIG_SYSTEM: system, GIT_CONFIG_NOSYSTEM: "1" },
      }).then(
        () => "accepted",
        () => "refused",
      );

      expect(bypassed).toBe("accepted");
      expect(isolated).toBe("refused");
    } finally {
      await fx.cleanup();
    }
  });
});

describe("a bare repository planted in the project folder", () => {
  it("is discovered by a plain git and refused by the runner", async () => {
    const fx = await makeGitFixture({ init: false });
    try {
      await execFileAsync("git", ["init", "-q", "--bare"], { cwd: fx.root });
      const plain = await execFileAsync("git", ["rev-parse", "--git-dir"], { cwd: fx.root });

      const guarded = await createGitRunner(defaultGitExecFile, fx.root).run([
        "rev-parse",
        "--git-dir",
      ]);

      expect(plain.stdout.trim()).toBe(".");
      expect(guarded).toMatchObject({ ok: false, failure: { kind: "bare-repository" } });
    } finally {
      await fx.cleanup();
    }
  });
});

describe("planGitConfig", () => {
  it("blanks clean and process and clears required for every named driver once", () => {
    expect(
      planGitConfig(
        "core.bare\0filter.lfs.clean\0filter.lfs.smudge\0filter.lfs.required\0filter.Evil.process\0",
      ),
    ).toEqual({
      ok: true,
      configArgs: [
        "-c",
        "filter.lfs.clean=",
        "-c",
        "filter.lfs.process=",
        "-c",
        "filter.lfs.required=false",
        "-c",
        "filter.Evil.clean=",
        "-c",
        "filter.Evil.process=",
        "-c",
        "filter.Evil.required=false",
      ],
    });
  });

  it("covers an empty driver name and one holding a line separator", () => {
    expect(planGitConfig("filter..clean\0")).toMatchObject({
      ok: true,
      configArgs: expect.arrayContaining(["filter..clean="]),
    });
    expect(planGitConfig("filter.a\u2028b.clean\0")).toMatchObject({
      ok: true,
      configArgs: expect.arrayContaining(["filter.a\u2028b.clean="]),
    });
  });

  it("keeps a dotted driver name whole", () => {
    expect(planGitConfig("filter.a.b.clean\0")).toMatchObject({
      ok: true,
      configArgs: expect.arrayContaining(["filter.a.b.clean="]),
    });
  });

  it("returns no overrides when no filter is configured", () => {
    expect(planGitConfig("core.bare\0user.name\0")).toEqual({ ok: true, configArgs: [] });
  });

  it.each(["filter.a=b.clean\0", "filter.a\uFFFDb.clean\0"])(
    "refuses a driver name that -c could not address: %j",
    (keys) => {
      expect(planGitConfig(keys)).toMatchObject({ ok: false, failure: { kind: "unsafe-config" } });
    },
  );

  it("refuses a repository with more drivers than it will switch off", () => {
    const keys = Array.from({ length: 129 }, (_, index) => `filter.d${index}.clean`).join("\0");

    expect(planGitConfig(keys)).toMatchObject({ ok: false, failure: { kind: "unsafe-config" } });
    expect(planGitConfig(keys.split("\0").slice(0, 128).join("\0"))).toMatchObject({ ok: true });
  });

  it("asks git not to fetch lazily when the repository is a partial clone", () => {
    expect(planGitConfig("extensions.partialclone\0")).toEqual({
      ok: true,
      configArgs: ["--no-lazy-fetch"],
    });
    expect(planGitConfig("remote.origin.promisor\0")).toEqual({
      ok: true,
      configArgs: ["--no-lazy-fetch"],
    });
    expect(planGitConfig("remote.a.b.promisor\0")).toMatchObject({
      configArgs: ["--no-lazy-fetch"],
    });
    expect(planGitConfig("remote.origin.url\0")).toEqual({ ok: true, configArgs: [] });
  });
});

describe("prepareGit", () => {
  it("reports a failure of the configuration listing", async () => {
    const execFile: GitExecFile = async () => {
      throw Object.assign(new Error("x"), { code: "ENOENT" });
    };

    expect(await prepareGit(execFile, "/p")).toMatchObject({
      ok: false,
      failure: { kind: "git-missing" },
    });
  });
});

describe("git runs repository-configured commands unless they are neutralised", () => {
  async function git(cwd: string, args: readonly string[]): Promise<void> {
    await execFileAsync("git", args as string[], { cwd });
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

describe("a partial clone fetches a missing object from its promisor remote", () => {
  async function partialClone(): Promise<{
    base: string;
    root: string;
    marker: string;
  }> {
    const fx = await makeGitFixture();
    const { base, root } = fx;
    const marker = join(base, "pcmark");
    const script = join(base, "uploadpack.sh");
    await fx.write("f.json", "{}\n");
    await fx.commitAll();
    const hash = (await fx.git(["rev-parse", "HEAD:f.json"])).trim();
    await rm(join(root, ".git", "objects", hash.slice(0, 2), hash.slice(2)), { force: true });
    await writeFile(script, `#!/bin/sh\necho ran >> "${marker}"\nexit 1\n`, { mode: 0o755 });
    await fx.git(["config", "core.repositoryformatversion", "1"]);
    await fx.git(["config", "extensions.partialclone", "origin"]);
    await fx.git(["config", "remote.origin.promisor", "true"]);
    await fx.git(["config", "remote.origin.url", join(base, "nowhere")]);
    await fx.git(["config", "remote.origin.uploadpack", script]);
    return { base, root, marker };
  }

  it("runs the remote's configured command on a plain read", async () => {
    const { base, root, marker } = await partialClone();
    try {
      await execFileAsync("git", ["cat-file", "blob", "HEAD:f.json"], { cwd: root }).catch(
        () => undefined,
      );

      expect(await exists(marker)).toBe(true);
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  it("does not through a prepared runner, and the read fails closed", async () => {
    const { base, root, marker } = await partialClone();
    try {
      const plan = await prepareGit(defaultGitExecFile, root);
      const configArgs = plan.ok ? plan.configArgs : [];

      const read = await createGitRunner(defaultGitExecFile, root, configArgs).run([
        "cat-file",
        "blob",
        "HEAD:f.json",
      ]);

      expect(configArgs).toContain("--no-lazy-fetch");
      expect(read).toMatchObject({ ok: false, failure: { kind: "git-failed" } });
      expect(await exists(marker)).toBe(false);
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  it("does not even with only the environment variable", async () => {
    const { base, root, marker } = await partialClone();
    try {
      await createGitRunner(defaultGitExecFile, root).run(["cat-file", "blob", "HEAD:f.json"]);

      expect(await exists(marker)).toBe(false);
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });
});

describe("isPathContained", () => {
  it("contains a path under the root, the root itself, and nothing beside it", () => {
    expect(isPathContained("/p", "/p/locales/de.json")).toBe(true);
    expect(isPathContained("/p/", "/p/locales/de.json")).toBe(true);
    expect(isPathContained("/p", "/p")).toBe(true);
    expect(isPathContained("/p", "/pp/de.json")).toBe(false);
    expect(isPathContained("/p", "/other")).toBe(false);
  });

  it("contains every absolute path when the root is the file-system root", () => {
    expect(isPathContained("/", "/locales/de.json")).toBe(true);
    expect(isPathContained("/", "/")).toBe(true);
  });
});

describe("sanitizeGitText", () => {
  it("removes control and bidirectional formatting characters", () => {
    expect(sanitizeGitText("a\u0000b\u202Ec\u200Fd\ne\u061Cf\u2066g\u2069h")).toBe("abcdefgh");
  });
});
