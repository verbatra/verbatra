import { chmod, mkdir, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { baseConfig, type GitFixture, makeGitFixture } from "../test-support.js";
import { type GitExecFile, gitExecFileWith, hasLeadingDash } from "./git-exec.js";
import {
  localeGitStatus,
  matchWatched,
  mergeStates,
  parsePorcelainZ,
  stateOfCode,
  toPosix,
  watchedFiles,
} from "./git-status.js";

const fixtures: GitFixture[] = [];

async function repo(): Promise<GitFixture> {
  return fixture();
}

async function fixture(options?: { init?: boolean }): Promise<GitFixture> {
  const created = await makeGitFixture(options);
  fixtures.push(created);
  return created;
}

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(fixtures.splice(0).map((created) => created.cleanup()));
});

async function seed(fx: GitFixture, cwd = fx.root): Promise<void> {
  await fx.write("locales/en.json", '{"a":"A"}\n', cwd);
  await fx.write("locales/de.json", '{"a":"a"}\n', cwd);
  await fx.write("verbatra.lock.json", "{}\n", cwd);
}

function failing(failure: Record<string, unknown>): GitExecFile {
  return async () => {
    throw Object.assign(new Error("git failed"), failure);
  };
}

describe("stateOfCode", () => {
  it.each([
    ["??", "untracked"],
    [" M", "modified"],
    ["M ", "modified"],
    ["MM", "modified"],
    ["T ", "modified"],
    ["A ", "added"],
    ["AM", "added"],
    [" A", "added"],
    [" D", "deleted"],
    ["D ", "deleted"],
    ["AD", "deleted"],
    ["DD", "conflicted"],
    ["AU", "conflicted"],
    ["UD", "conflicted"],
    ["UA", "conflicted"],
    ["DU", "conflicted"],
    ["AA", "conflicted"],
    ["UU", "conflicted"],
  ])("reads %j as %s", (code, state) => {
    expect(stateOfCode(code)).toBe(state);
  });
});

describe("parsePorcelainZ", () => {
  it("splits NUL-terminated entries and keeps paths verbatim", () => {
    expect(parsePorcelainZ(' M a b.json\0?? "q".json\0?? new\nline.json\0')).toEqual([
      { code: " M", path: "a b.json" },
      { code: "??", path: '"q".json' },
      { code: "??", path: "new\nline.json" },
    ]);
  });

  it("ignores empty and malformed entries", () => {
    expect(parsePorcelainZ("\0ab\0XY\0 M\0M-a.json\0")).toEqual([]);
  });
});

describe("mergeStates", () => {
  const entry = (state: "deleted" | "untracked" | "modified" | "added") => ({
    state,
    repoPath: "p",
  });

  it("reads a staged deletion plus an untracked file as modified", () => {
    expect(mergeStates(entry("deleted"), entry("untracked")).state).toBe("modified");
    expect(mergeStates(entry("untracked"), entry("deleted")).state).toBe("modified");
  });

  it("otherwise keeps the later entry", () => {
    expect(mergeStates(entry("added"), entry("modified")).state).toBe("modified");
    expect(mergeStates(entry("deleted"), entry("deleted")).state).toBe("deleted");
  });
});

describe("toPosix", () => {
  it("leaves a posix path alone and converts a backslash-separated one", () => {
    expect(toPosix("a/b.json", "/")).toBe("a/b.json");
    expect(toPosix("a\\b\\c.json", "\\")).toBe("a/b/c.json");
  });
});

describe("matchWatched", () => {
  const files = [
    { path: "locales/de.json", locales: ["de"] },
    { path: "Locales/Fr.json", locales: ["fr"] },
  ];

  it("strips the repository prefix and matches exactly", () => {
    expect(matchWatched(files, "app/", "app/locales/de.json")).toBe(files[0]);
  });

  it("drops a path outside the prefix", () => {
    expect(matchWatched(files, "app/", "other/locales/de.json")).toBeUndefined();
  });

  it("matches a decomposed name against a precomposed one", () => {
    const composed = [{ path: "l\u00e4/de.json", locales: ["de"] }];

    expect(matchWatched(composed, "", "la\u0308/de.json")).toBe(composed[0]);
  });

  it("falls back to a case-insensitive match when it is unambiguous", () => {
    expect(matchWatched(files, "", "locales/fr.json")).toBe(files[1]);
  });

  it("prefers the exact match under normalization when two watched files fold alike", () => {
    const pair = [
      { path: "L\u00e4/de.json", locales: ["a"] },
      { path: "l\u00e4/de.json", locales: ["b"] },
    ];

    expect(matchWatched(pair, "", "la\u0308/de.json")).toBe(pair[1]);
  });

  it("normalizes a watched path too when two watched files fold alike", () => {
    const pair = [
      { path: "la\u0308/de.json", locales: ["a"] },
      { path: "La\u0308/de.json", locales: ["b"] },
    ];

    expect(matchWatched(pair, "", "l\u00e4/de.json")).toBe(pair[0]);
  });

  it("refuses a case-insensitive match when two watched files fold alike", () => {
    const clash = [
      { path: "a.json", locales: ["a"] },
      { path: "A.json", locales: ["b"] },
    ];

    expect(matchWatched(clash, "", "a.JSON")).toBeUndefined();
  });
});

describe("watchedFiles", () => {
  it("lists every locale file, then the lock and provenance files, relative to the project", () => {
    const files = watchedFiles("/project", baseConfig({ targetLocales: ["de", "fr"] }));

    expect(files).toEqual([
      { path: "locales/en.json", locales: ["en"] },
      { path: "locales/de.json", locales: ["de"] },
      { path: "locales/fr.json", locales: ["fr"] },
      { path: "verbatra.lock.json", locales: [] },
      { path: "verbatra.provenance.json", locales: [] },
    ]);
  });

  it("groups every locale of a shared catalogue under its one file", () => {
    const files = watchedFiles(
      "/project",
      baseConfig({
        format: "apple-xcstrings",
        files: { pattern: "{locale}Localizable.xcstrings" },
        targetLocales: ["de", "fr"],
      }),
    );

    expect(files[0]).toEqual({ path: "Localizable.xcstrings", locales: ["en", "de", "fr"] });
  });

  it("drops a locale path that leaves the project", () => {
    const files = watchedFiles(
      "/project",
      baseConfig({ files: { pattern: "../outside/{locale}.json" } }),
    );

    expect(files.map((file) => file.path)).toEqual([
      "verbatra.lock.json",
      "verbatra.provenance.json",
    ]);
  });

  it("never yields a path with a leading dash that is not under a directory name", () => {
    const files = watchedFiles("/project", baseConfig({ files: { pattern: "{locale}.json" } }));

    expect(files.some((file) => hasLeadingDash(file.path))).toBe(false);
  });
});

describe("localeGitStatus against a real repository", () => {
  it("reports every state, the lock file, and the branch", async () => {
    const fx = await fixture();
    await seed(fx);
    await fx.write("locales/fr.json", '{"a":"f"}\n');
    await fx.write("locales/es.json", '{"a":"e"}\n');
    await fx.write("locales/it.json", '{"a":"i"}\n');
    await fx.commitAll();
    await fx.write("locales/de.json", '{"a":"changed"}\n');
    await fx.git(["rm", "-q", "locales/fr.json"]);
    await fx.write("locales/pt.json", '{"a":"p"}\n');
    await fx.git(["add", "locales/pt.json"]);
    await fx.write("locales/nl.json", '{"a":"n"}\n');
    await fx.write("verbatra.lock.json", '{"x":1}\n');
    const config = baseConfig({ targetLocales: ["de", "fr", "pt", "nl"] });

    const status = await localeGitStatus({ config, cwd: fx.root });

    expect(status).toEqual({
      available: true,
      branch: "main",
      files: [
        { path: "locales/de.json", locales: ["de"], state: "modified" },
        { path: "locales/fr.json", locales: ["fr"], state: "deleted" },
        { path: "locales/pt.json", locales: ["pt"], state: "added" },
        { path: "locales/nl.json", locales: ["nl"], state: "untracked" },
        { path: "verbatra.lock.json", locales: [], state: "modified" },
      ],
    });
  });

  it("lists nothing for a clean tree", async () => {
    const fx = await fixture();
    await seed(fx);
    await fx.commitAll();

    const status = await localeGitStatus({ config: baseConfig(), cwd: fx.root });

    expect(status).toEqual({ available: true, branch: "main", files: [] });
  });

  it("reports a conflicted file", async () => {
    const fx = await fixture();
    await seed(fx);
    await fx.commitAll();
    await fx.git(["checkout", "-q", "-b", "other"]);
    await fx.write("locales/de.json", '{"a":"other"}\n');
    await fx.commitAll("other");
    await fx.git(["checkout", "-q", "main"]);
    await fx.write("locales/de.json", '{"a":"main"}\n');
    await fx.commitAll("main");
    await fx.git(["merge", "other"]).catch(() => undefined);

    const status = await localeGitStatus({ config: baseConfig(), cwd: fx.root });

    expect(status).toMatchObject({
      available: true,
      files: [{ path: "locales/de.json", state: "conflicted" }],
    });
  });

  it("reports the branch of a repository with no commits", async () => {
    const fx = await fixture();
    await seed(fx);

    const status = await localeGitStatus({ config: baseConfig(), cwd: fx.root });

    expect(status).toEqual({
      available: true,
      branch: "main",
      files: [
        { path: "locales/en.json", locales: ["en"], state: "untracked" },
        { path: "locales/de.json", locales: ["de"], state: "untracked" },
        { path: "verbatra.lock.json", locales: [], state: "untracked" },
      ],
    });
  });

  it("reports a null branch on a detached HEAD", async () => {
    const fx = await fixture();
    await seed(fx);
    await fx.commitAll();
    await fx.git(["checkout", "-q", "--detach"]);

    const status = await localeGitStatus({ config: baseConfig(), cwd: fx.root });

    expect(status).toEqual({ available: true, branch: null, files: [] });
  });

  it("maps paths for a project in a monorepo subdirectory", async () => {
    const fx = await fixture();
    const app = join(fx.root, "packages", "app");
    await seed(fx, app);
    await fx.write("locales/de.json", '{"a":"root"}\n');
    await fx.commitAll();
    await fx.write("locales/de.json", '{"a":"app changed"}\n', app);
    await fx.write("locales/de.json", '{"a":"root changed"}\n');

    const status = await localeGitStatus({ config: baseConfig(), cwd: app });

    expect(status).toEqual({
      available: true,
      branch: "main",
      files: [{ path: "locales/de.json", locales: ["de"], state: "modified" }],
    });
  });

  it("reads a linked worktree", async () => {
    const fx = await fixture();
    await seed(fx);
    await fx.commitAll();
    const linked = join(fx.base, "linked");
    await fx.git(["worktree", "add", "-q", "-b", "feature", linked]);
    await fx.write("locales/de.json", '{"a":"x"}\n', linked);

    const status = await localeGitStatus({ config: baseConfig(), cwd: linked });

    expect(status).toMatchObject({
      available: true,
      branch: "feature",
      files: [{ path: "locales/de.json", state: "modified" }],
    });
  });

  it("reports a rename as a deleted and an added file", async () => {
    const fx = await fixture();
    await seed(fx);
    await fx.commitAll();
    await fx.git(["mv", "locales/de.json", "locales/fr.json"]);

    const status = await localeGitStatus({
      config: baseConfig({ targetLocales: ["de", "fr"] }),
      cwd: fx.root,
    });

    expect(status).toMatchObject({
      files: [
        { path: "locales/de.json", state: "deleted" },
        { path: "locales/fr.json", state: "added" },
      ],
    });
  });

  it("ignores a status entry that is not a watched file", async () => {
    const fx = await repo();
    await fx.write("locales/extra.json", "{}\n");
    const config = baseConfig({
      sourceLocale: "locales",
      targetLocales: ["de"],
      files: { pattern: "{locale}" },
    });

    const status = await localeGitStatus({ config, cwd: fx.root });

    expect(status).toEqual({ available: true, branch: "main", files: [] });
  });

  it("keeps a staged deletion visible when the file is back on disk untracked", async () => {
    const fx = await repo();
    await fx.write("locales/de.json", "{}\n");
    await fx.commitAll();
    await fx.git(["rm", "-q", "--cached", "locales/de.json"]);

    const status = await localeGitStatus({ config: baseConfig(), cwd: fx.root });

    expect(status).toMatchObject({
      files: [{ path: "locales/de.json", state: "modified" }],
    });
  });

  it("keeps a staged deletion visible when the file on disk is ignored", async () => {
    const fx = await repo();
    await fx.write("locales/de.json", "{}\n");
    await fx.commitAll();
    await fx.write(".gitignore", "locales/de.json\n");
    await fx.git(["rm", "-q", "--cached", "locales/de.json"]);

    const status = await localeGitStatus({ config: baseConfig(), cwd: fx.root });

    expect(status).toMatchObject({ files: [{ path: "locales/de.json", state: "modified" }] });
  });

  it("does not list an ignored file that git never tracked", async () => {
    const fx = await repo();
    await fx.write(".gitignore", "locales/de.json\n");
    await fx.write("locales/de.json", "{}\n");
    await fx.commitAll();

    const status = await localeGitStatus({ config: baseConfig(), cwd: fx.root });

    expect(status).toEqual({ available: true, branch: "main", files: [] });
  });

  it("reads a path matching a glob character literally", async () => {
    const fx = await fixture();
    await fx.write("d.json", "{}\n");
    await fx.commitAll();
    await fx.write("[de].json", "{}\n");
    const bracketed = baseConfig({
      sourceLocale: "d",
      targetLocales: ["de"],
      files: { pattern: "[{locale}].json" },
    });

    const status = await localeGitStatus({ config: bracketed, cwd: fx.root });

    expect(status).toMatchObject({
      available: true,
      files: [{ path: "[de].json", locales: ["de"], state: "untracked" }],
    });
  });

  it("reads a path starting with a dash and one containing a newline", async () => {
    const fx = await fixture();
    await fx.write("-x/de.json", "{}\n");
    await fx.write("n\nl/de.json", "{}\n");
    const dash = baseConfig({ files: { pattern: "-x/{locale}.json" } });
    const newline = baseConfig({ files: { pattern: "n\nl/{locale}.json" } });

    const dashStatus = await localeGitStatus({ config: dash, cwd: fx.root });
    const newlineStatus = await localeGitStatus({ config: newline, cwd: fx.root });

    expect(dashStatus).toMatchObject({ files: [{ path: "-x/de.json", state: "untracked" }] });
    expect(newlineStatus).toMatchObject({ files: [{ path: "n\nl/de.json", state: "untracked" }] });
  });

  it("lists nothing for a locale file behind a symbolic link", async () => {
    const fx = await fixture();
    await fx.write("real/de.json", "{}\n");
    await fx.write("real/en.json", "{}\n");
    await fx.commitAll();
    await symlink(join(fx.root, "real"), join(fx.root, "locales"));

    const status = await localeGitStatus({ config: baseConfig(), cwd: fx.root });

    expect(status).toEqual({ available: true, branch: "main", files: [] });
  });

  it("lists nothing for a locale file inside a submodule", async () => {
    const fx = await fixture();
    const sub = await fixture();
    await sub.write("de.json", "{}\n");
    await sub.commitAll();
    await fx.write("README.md", "x\n");
    await fx.commitAll();
    await fx.git([
      "-c",
      "protocol.file.allow=always",
      "submodule",
      "add",
      "-q",
      sub.root,
      "locales",
    ]);

    const status = await localeGitStatus({ config: baseConfig(), cwd: fx.root });

    expect(status).toMatchObject({ available: true, files: [] });
  });

  it("reports a corrupt index as a git failure", async () => {
    const fx = await fixture();
    await seed(fx);
    await fx.commitAll();
    await writeFile(join(fx.root, ".git", "index"), "garbage");

    const status = await localeGitStatus({ config: baseConfig(), cwd: fx.root });

    expect(status).toEqual({ available: false, reason: "git-failed" });
  });

  it("does not enter a submodule to run its content filter", async () => {
    const fx = await fixture();
    const sub = await fixture();
    await sub.write("de.json", '{"a":"1"}\n');
    await sub.write(".gitattributes", "*.json filter=evil\n");
    await sub.commitAll();
    await fx.write("r.txt", "x\n");
    await fx.commitAll();
    await fx.git([
      "-c",
      "protocol.file.allow=always",
      "submodule",
      "add",
      "-q",
      sub.root,
      "locales",
    ]);
    const inner = join(fx.root, "locales");
    const clean = join(fx.base, "clean.sh");
    await writeFile(clean, `#!/bin/sh\necho ran >> "${join(fx.base, "marker")}"\ncat\n`);
    await chmod(clean, 0o755);
    await fx.git(["config", "filter.evil.clean", clean], inner);
    await fx.write("de.json", '{"a":"2"}\n', inner);
    const config = baseConfig({
      sourceLocale: "locales",
      targetLocales: ["de"],
      files: { pattern: "{locale}" },
    });

    const status = await localeGitStatus({ config, cwd: fx.root });

    expect(status).toMatchObject({ available: true });
    expect(await fx.exists("marker")).toBe(false);
  });

  it("reads a magic-looking path literally", async () => {
    const fx = await fixture();
    await fx.write("de.json", "{}\n");
    await fx.commitAll();
    await fx.write(":(top)de.json", "{}\n");
    const config = baseConfig({
      sourceLocale: "d",
      targetLocales: ["de"],
      files: { pattern: ":(top){locale}.json" },
    });

    const status = await localeGitStatus({ config, cwd: fx.root });

    expect(status).toMatchObject({
      files: [{ path: ":(top)de.json", locales: ["de"], state: "untracked" }],
    });
  });
});

describe("localeGitStatus environment failures", () => {
  it("reports a directory that is not in a repository", async () => {
    const fx = await fixture({ init: false });
    await mkdir(join(fx.root, "x"), { recursive: true });
    vi.stubEnv("GIT_CEILING_DIRECTORIES", fx.base);

    const status = await localeGitStatus({ config: baseConfig(), cwd: fx.root });

    expect(status).toEqual({ available: false, reason: "not-a-repository" });
  });

  it("refuses a bare repository planted in the project folder", async () => {
    const fx = await fixture({ init: false });
    await fx.git(["init", "-q", "--bare"]);

    const status = await localeGitStatus({ config: baseConfig(), cwd: fx.root });

    expect(status).toEqual({ available: false, reason: "bare-repository" });
  });

  it("reports the inside of a git directory as not a work tree", async () => {
    const fx = await fixture();

    const status = await localeGitStatus({ config: baseConfig(), cwd: join(fx.root, ".git") });

    expect(status).toEqual({ available: false, reason: "not-a-repository" });
  });

  it("reports a repository owned by another user", async () => {
    const fx = await fixture();
    await seed(fx);
    await fx.commitAll();
    const execFile = gitExecFileWith({
      GIT_TEST_ASSUME_DIFFERENT_OWNER: "1",
      GIT_CONFIG_NOSYSTEM: "1",
      HOME: fx.home,
    });

    const status = await localeGitStatus({ config: baseConfig(), cwd: fx.root }, { execFile });

    expect(status).toEqual({ available: false, reason: "dubious-ownership" });
  });

  it.each([
    ["git-missing", { code: "ENOENT" }],
    ["timeout", { killed: true, signal: "SIGTERM" }],
    ["output-too-large", { code: "ERR_CHILD_PROCESS_STDIO_MAXBUFFER" }],
    ["git-failed", { code: 128, stderr: "fatal: unexpected" }],
    ["dubious-ownership", { code: 128, stderr: "fatal: detected dubious ownership" }],
  ])("reports %s from the first command", async (reason, failure) => {
    const status = await localeGitStatus(
      { config: baseConfig(), cwd: "/project" },
      { execFile: failing(failure) },
    );

    expect(status).toEqual({ available: false, reason });
  });

  it("reports a failure of every later command", async () => {
    const replies = [
      { stdout: "true\n" },
      { stdout: "core.bare\0" },
      { stdout: `${"a".repeat(40)}\n` },
    ];
    for (const failAt of [1, 2, 3, 4, 5]) {
      let call = 0;
      const execFile: GitExecFile = async () => {
        call += 1;
        if (call === failAt) {
          throw Object.assign(new Error("x"), { code: "ENOENT" });
        }
        return { stdout: replies[call - 1]?.stdout ?? "", stderr: "" };
      };

      const status = await localeGitStatus({ config: baseConfig(), cwd: "/project" }, { execFile });

      expect(status).toEqual({ available: false, reason: "git-missing" });
    }
  });

  it("reports a head that is not a commit hash as a git failure", async () => {
    const execFile: GitExecFile = vi
      .fn()
      .mockResolvedValueOnce({ stdout: "true\n", stderr: "" })
      .mockResolvedValueOnce({ stdout: "", stderr: "" })
      .mockResolvedValueOnce({ stdout: "not-a-hash\n", stderr: "" });

    const status = await localeGitStatus({ config: baseConfig(), cwd: "/project" }, { execFile });

    expect(status).toEqual({ available: false, reason: "git-failed" });
  });

  it("strips control characters from a branch name", async () => {
    const execFile: GitExecFile = vi
      .fn()
      .mockResolvedValueOnce({ stdout: "true\n", stderr: "" })
      .mockResolvedValueOnce({ stdout: "", stderr: "" })
      .mockResolvedValueOnce({ stdout: `${"a".repeat(40)}\n`, stderr: "" })
      .mockResolvedValueOnce({ stdout: "ma\u202Ein\u0007\n", stderr: "" })
      .mockResolvedValueOnce({ stdout: "", stderr: "" });

    const status = await localeGitStatus({ config: baseConfig(), cwd: "/project" }, { execFile });

    expect(status).toMatchObject({ available: true, branch: "main" });
  });

  it("reports an empty branch name as detached", async () => {
    const execFile: GitExecFile = vi
      .fn()
      .mockResolvedValueOnce({ stdout: "true\n", stderr: "" })
      .mockResolvedValueOnce({ stdout: "", stderr: "" })
      .mockResolvedValueOnce({ stdout: `${"a".repeat(40)}\n`, stderr: "" })
      .mockResolvedValueOnce({ stdout: "\u202E\n", stderr: "" })
      .mockResolvedValueOnce({ stdout: "", stderr: "" });

    const status = await localeGitStatus({ config: baseConfig(), cwd: "/project" }, { execFile });

    expect(status).toMatchObject({ available: true, branch: null });
  });

  it("passes only literal, option-terminated, project-relative paths to status", async () => {
    const execFile = vi
      .fn()
      .mockResolvedValueOnce({ stdout: "true\napp/\n", stderr: "" })
      .mockResolvedValueOnce({ stdout: "", stderr: "" })
      .mockResolvedValueOnce({ stdout: `${"a".repeat(40)}\n`, stderr: "" })
      .mockResolvedValueOnce({ stdout: "main\n", stderr: "" })
      .mockResolvedValueOnce({ stdout: " M app/locales/de.json\0", stderr: "" });

    const status = await localeGitStatus(
      { config: baseConfig(), cwd: "/project" },
      { execFile: execFile as unknown as GitExecFile },
    );

    const args = execFile.mock.calls[4]?.[1] as string[];
    expect(args.slice(0, 4)).toEqual([
      "--no-optional-locks",
      "--literal-pathspecs",
      "-c",
      "core.fsmonitor=false",
    ]);
    expect(args.slice(args.indexOf("--"))).toEqual([
      "--",
      "locales/en.json",
      "locales/de.json",
      "verbatra.lock.json",
      "verbatra.provenance.json",
    ]);
    expect(status).toMatchObject({ files: [{ path: "locales/de.json", state: "modified" }] });
    for (const call of execFile.mock.calls) {
      expect(call[2]).toMatchObject({ cwd: "/project", timeout: 10_000, maxBuffer: 1_048_576 });
    }
  });
});
