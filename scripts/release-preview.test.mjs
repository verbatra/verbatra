import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  changelogSection,
  countLinesAndWords,
  main,
  PREVIEW_CHANGELOG,
  previewConfig,
  renderPreview,
  rewriteChangesetConfig,
  versionBumps,
  withTemporaryWorktree,
} from "./release-preview.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ROOT_MANIFEST = JSON.parse(readFileSync(resolve(REPO_ROOT, "package.json"), "utf8"));
const CHANGESET_CONFIG = JSON.parse(
  readFileSync(resolve(REPO_ROOT, ".changeset/config.json"), "utf8"),
);

const scratchDirs = [];

function scratch() {
  const dir = mkdtempSync(join(realpathSync(tmpdir()), "verbatra-release-preview-test-"));
  scratchDirs.push(dir);
  return dir;
}

function git(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function writeFile(root, relative, content) {
  mkdirSync(dirname(join(root, relative)), { recursive: true });
  writeFileSync(join(root, relative), content);
}

function committedRepo() {
  const repo = scratch();
  git(repo, ["init", "--quiet"]);
  writeFile(repo, ".changeset/config.json", `${JSON.stringify(CHANGESET_CONFIG, null, 2)}\n`);
  writeFile(repo, "packages/a/package.json", '{"name":"@x/a","version":"1.0.0"}\n');
  writeFile(repo, "packages/b/package.json", '{"name":"@x/b","version":"2.0.0"}\n');
  git(repo, ["add", "."]);
  git(repo, [
    "-c",
    "user.name=test",
    "-c",
    "user.email=test@example.com",
    "commit",
    "--quiet",
    "-m",
    "init",
  ]);
  return repo;
}

function linkedWorktrees(repo) {
  return git(repo, ["worktree", "list", "--porcelain"])
    .split("\n")
    .filter((line) => line.startsWith("worktree "));
}

afterEach(() => {
  for (const dir of scratchDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("release-preview: the changeset config rewrite", () => {
  it("replaces the GitHub changelog with the offline changesets one when no token is set", () => {
    expect(CHANGESET_CONFIG.changelog[0]).toBe("../scripts/changelog-unique-commits.mjs");
    expect(previewConfig(CHANGESET_CONFIG, {})).toEqual({
      ...CHANGESET_CONFIG,
      changelog: PREVIEW_CHANGELOG,
    });
    expect(PREVIEW_CHANGELOG).toBe("@changesets/cli/changelog");
  });

  it("keeps the configured GitHub changelog when GITHUB_TOKEN is set", () => {
    expect(previewConfig(CHANGESET_CONFIG, { GITHUB_TOKEN: "token" })).toBe(CHANGESET_CONFIG);
  });

  it("rewrites only the checkout it is given and leaves every other key unchanged", () => {
    const dir = scratch();
    writeFile(dir, ".changeset/config.json", JSON.stringify(CHANGESET_CONFIG));

    rewriteChangesetConfig(dir, {});

    const written = JSON.parse(readFileSync(join(dir, ".changeset/config.json"), "utf8"));
    expect(written).toEqual({ ...CHANGESET_CONFIG, changelog: PREVIEW_CHANGELOG });
    expect(JSON.parse(readFileSync(resolve(REPO_ROOT, ".changeset/config.json"), "utf8"))).toEqual(
      CHANGESET_CONFIG,
    );
  });
});

describe("release-preview: the temporary worktree", () => {
  it("removes the worktree and its directory after a successful run", async () => {
    const repo = committedRepo();
    let seen = "";

    const result = await withTemporaryWorktree(repo, (worktree) => {
      seen = worktree;
      expect(existsSync(join(worktree, ".changeset/config.json"))).toBe(true);
      return "done";
    });

    expect(result).toBe("done");
    expect(existsSync(dirname(seen))).toBe(false);
    expect(linkedWorktrees(repo)).toHaveLength(1);
  });

  it("removes the worktree and its directory when the run throws", async () => {
    const repo = committedRepo();
    let seen = "";

    await expect(
      withTemporaryWorktree(repo, (worktree) => {
        seen = worktree;
        throw new Error("changeset version failed");
      }),
    ).rejects.toThrow("changeset version failed");

    expect(seen).not.toBe("");
    expect(existsSync(dirname(seen))).toBe(false);
    expect(linkedWorktrees(repo)).toHaveLength(1);
  });

  it("removes a node_modules link without touching what it points at", async () => {
    const repo = committedRepo();
    const target = scratch();
    writeFile(target, "keep.txt", "keep");

    await withTemporaryWorktree(repo, (worktree) => {
      execFileSync("ln", ["-s", target, join(worktree, "node_modules")]);
    });

    expect(readFileSync(join(target, "keep.txt"), "utf8")).toBe("keep");
    expect(linkedWorktrees(repo)).toHaveLength(1);
  });

  it("reports the versions that changed against the committed manifests", async () => {
    const repo = committedRepo();

    const bumps = await withTemporaryWorktree(repo, (worktree) => {
      writeFile(worktree, "packages/a/package.json", '{"name":"@x/a","version":"1.1.0"}\n');
      return versionBumps(worktree);
    });

    expect(bumps).toEqual([{ dir: "packages/a", name: "@x/a", from: "1.0.0", to: "1.1.0" }]);
  });
});

function untouched(repo) {
  expect(git(repo, ["status", "--porcelain", "--ignored"])).toBe("");
  expect(JSON.parse(readFileSync(join(repo, ".changeset/config.json"), "utf8"))).toEqual(
    CHANGESET_CONFIG,
  );
  expect(linkedWorktrees(repo)).toHaveLength(1);
}

describe("release-preview: main", () => {
  it("versions inside the temporary worktree, prints the report, and leaves the real tree untouched", async () => {
    const repo = committedRepo();
    const calls = [];
    const logged = [];

    await main({
      repoRoot: repo,
      env: {},
      log: (text) => logged.push(text),
      run: (command, args, options) => {
        calls.push({ command, args, cwd: options.cwd });
        if (args[0] === "version") {
          const config = JSON.parse(
            readFileSync(join(options.cwd, ".changeset/config.json"), "utf8"),
          );
          expect(config.changelog).toBe(PREVIEW_CHANGELOG);
          writeFile(options.cwd, "packages/a/package.json", '{"name":"@x/a","version":"1.1.0"}\n');
          writeFile(
            options.cwd,
            "packages/a/CHANGELOG.md",
            "# @x/a\n\n## 1.1.0\n\n- abc: Adds it.\n",
          );
        }
      },
    });

    expect(calls.map((call) => call.args)).toEqual([
      ["version"],
      [expect.stringMatching(/scripts[/\\]mcp-server-json\.mjs$/), "sync"],
    ]);
    for (const call of calls) {
      expect(call.cwd).not.toBe(repo);
      expect(existsSync(call.cwd)).toBe(false);
    }
    expect(logged.join("\n")).toContain("  @x/a: 1.0.0 -> 1.1.0");
    expect(logged.join("\n")).toContain("=== @x/a@1.1.0 (3 lines, 6 words) ===");
    untouched(repo);
  });

  it("cleans up and leaves the real tree untouched when changeset version fails", async () => {
    const repo = committedRepo();

    await expect(
      main({
        repoRoot: repo,
        env: {},
        log: () => {},
        run: () => {
          throw new Error("changeset version exited with 1");
        },
      }),
    ).rejects.toThrow("changeset version exited with 1");

    untouched(repo);
  });

  it("removes the worktree when interrupted with SIGINT", () => {
    const repo = committedRepo();
    const script = resolve(REPO_ROOT, "scripts/release-preview.mjs");
    const code = [
      `const { withTemporaryWorktree } = await import(${JSON.stringify(script)});`,
      `await withTemporaryWorktree(${JSON.stringify(repo)}, (worktree) => {`,
      "  console.log(worktree);",
      "  process.kill(process.pid, 'SIGINT');",
      "  return new Promise(() => { setInterval(() => {}, 1_000); });",
      "});",
    ].join("\n");

    const result = spawnSync(process.execPath, ["--input-type=module", "-e", code], {
      encoding: "utf8",
      timeout: 30_000,
    });

    expect(result.status).toBe(130);
    const worktree = result.stdout.trim();
    expect(worktree).not.toBe("");
    expect(existsSync(dirname(worktree))).toBe(false);
    untouched(repo);
  });
});

describe("release-preview: the printed report", () => {
  const changelog = [
    "# @x/a",
    "",
    "## 1.1.0",
    "",
    "### Minor Changes",
    "",
    "- abc1234: Adds a thing.",
    "",
    "## 1.0.0",
    "",
    "- old entry",
    "",
  ].join("\n");

  it("extracts only the section of the new version", () => {
    expect(changelogSection(changelog, "1.1.0")).toBe(
      "## 1.1.0\n\n### Minor Changes\n\n- abc1234: Adds a thing.",
    );
    expect(changelogSection(changelog, "9.9.9")).toBeUndefined();
  });

  it("counts lines and words of a section", () => {
    expect(countLinesAndWords("## 1.1.0\n\n- a b c")).toEqual({ lines: 3, words: 6 });
    expect(countLinesAndWords("  ")).toEqual({ lines: 0, words: 0 });
  });

  it("prints each bump and its changelog section with counts", () => {
    const dir = scratch();
    writeFile(dir, "packages/a/CHANGELOG.md", changelog);

    const report = renderPreview(dir, [
      { dir: "packages/a", name: "@x/a", from: "1.0.0", to: "1.1.0" },
      { dir: "packages/b", name: "@x/b", from: undefined, to: "0.1.0" },
    ]);

    expect(report).toContain("  @x/a: 1.0.0 -> 1.1.0");
    expect(report).toContain("  @x/b: (new) -> 0.1.0");
    expect(report).toContain("=== @x/a@1.1.0 (5 lines, 10 words) ===");
    expect(report).toContain("=== @x/b@0.1.0: no CHANGELOG section written ===");
  });

  it("says so when nothing is pending", () => {
    expect(renderPreview(scratch(), [])).toContain("no pending changesets");
  });

  it("is wired as the root release:preview script", () => {
    expect(ROOT_MANIFEST.scripts["release:preview"]).toBe("node scripts/release-preview.mjs");
  });
});
