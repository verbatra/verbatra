import { execFile as execFileCb } from "node:child_process";
import { appendFile, chmod, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it, vi } from "vitest";
import { baseConfig, type GitFixture, makeGitFixture } from "../test-support.js";
import { localeGitDiff } from "./git-diff.js";
import { defaultGitExecFile, type GitExecFile } from "./git-exec.js";
import { localeGitStatus } from "./git-status.js";
import { openGitWorkTree } from "./git-worktree.js";

const execFileAsync = promisify(execFileCb);
const fixtures: GitFixture[] = [];

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((created) => created.cleanup()));
});

async function committedProject(): Promise<GitFixture> {
  const fx = await makeGitFixture();
  fixtures.push(fx);
  await fx.write("locales/en.json", '{"a":"A"}\n');
  await fx.write("locales/de.json", '{"a":"a"}\n');
  await fx.commitAll();
  return fx;
}

async function script(fx: GitFixture, name: string, body: string): Promise<string> {
  const path = join(fx.base, name);
  await writeFile(path, `#!/bin/sh\n${body}\n`);
  await chmod(path, 0o755);
  return path;
}

async function clearMarker(fx: GitFixture): Promise<void> {
  await rm(join(fx.base, "marker"), { force: true });
}

function markerBody(fx: GitFixture, tail: string): string {
  return `echo ran >> "${join(fx.base, "marker")}"\n${tail}`;
}

describe("a repository that configures commands to run", () => {
  it("does not run a clean filter, even a required one, while reading status", async () => {
    const fx = await committedProject();
    const clean = await script(fx, "clean.sh", markerBody(fx, "cat"));
    await fx.write(".gitattributes", "*.json filter=evil\n");
    await fx.git(["config", "filter.evil.clean", clean]);
    await fx.git(["config", "filter.evil.required", "true"]);
    await fx.commitAll();
    await fx.write("locales/de.json", '{"a":"b"}\n');

    await clearMarker(fx);
    const status = await localeGitStatus({ config: baseConfig(), cwd: fx.root });

    expect(status).toMatchObject({ files: [{ path: "locales/de.json", state: "modified" }] });
    expect(await fx.exists("marker")).toBe(false);
  });

  it("does not start a process filter", async () => {
    const fx = await committedProject();
    const process = await script(fx, "process.sh", markerBody(fx, "exit 1"));
    await fx.write(".gitattributes", "*.json filter=evil\n");
    await fx.git(["config", "filter.evil.process", process]);
    await fx.commitAll();
    await fx.write("locales/de.json", '{"a":"b"}\n');

    await clearMarker(fx);
    const status = await localeGitStatus({ config: baseConfig(), cwd: fx.root });

    expect(status).toMatchObject({ available: true });
    expect(await fx.exists("marker")).toBe(false);
  });

  it("does not run a filter named in .git/info/attributes", async () => {
    const fx = await committedProject();
    const clean = await script(fx, "clean.sh", markerBody(fx, "cat"));
    await writeFile(join(fx.root, ".git", "info", "attributes"), "*.json filter=evil\n");
    await fx.git(["config", "filter.evil.clean", clean]);
    await fx.write("locales/de.json", '{"a":"b"}\n');

    await clearMarker(fx);
    const status = await localeGitStatus({ config: baseConfig(), cwd: fx.root });

    expect(status).toMatchObject({ files: [{ state: "modified" }] });
    expect(await fx.exists("marker")).toBe(false);
  });

  it("proves a plain status does run that filter", async () => {
    const fx = await committedProject();
    const clean = await script(fx, "clean.sh", markerBody(fx, "cat"));
    await fx.write(".gitattributes", "*.json filter=evil\n");
    await fx.git(["config", "filter.evil.clean", clean]);
    await fx.commitAll();
    await fx.write("locales/de.json", '{"a":"b"}\n');

    await clearMarker(fx);
    await fx.git(["status", "--porcelain"]);

    expect(await fx.exists("marker")).toBe(true);
  });

  it("refuses a driver name that a -c override could not address, and runs nothing", async () => {
    const fx = await committedProject();
    const clean = await script(fx, "clean.sh", markerBody(fx, "cat"));
    await fx.write(".gitattributes", "*.json filter=a=b\n");
    await fx.git(["config", "filter.a=b.clean", clean]);
    await fx.commitAll();
    await fx.write("locales/de.json", '{"a":"b"}\n');

    await clearMarker(fx);
    const status = await localeGitStatus({ config: baseConfig(), cwd: fx.root });

    expect(status).toEqual({ available: false, reason: "unsafe-config" });
    expect(await fx.exists("marker")).toBe(false);
  });

  it("proves a -c override cannot address a name holding an equals sign", async () => {
    const fx = await committedProject();
    const clean = await script(fx, "clean.sh", markerBody(fx, "cat"));
    await fx.write(".gitattributes", "*.json filter=a=b\n");
    await fx.git(["config", "filter.a=b.clean", clean]);
    await fx.commitAll();
    await fx.write("locales/de.json", '{"a":"b"}\n');

    await clearMarker(fx);
    await execFileAsync("git", ["-c", "filter.a=b.clean=", "status", "--porcelain"], {
      cwd: fx.root,
    }).catch(() => undefined);

    expect(await fx.exists("marker")).toBe(true);
  });

  it("ignores aliases, pagers, hooks and text conversion drivers", async () => {
    const fx = await committedProject();
    const hook = await script(fx, "hook.sh", markerBody(fx, "exit 0"));
    await fx.write(".gitattributes", "*.json diff=evil\n");
    await fx.git(["config", "alias.status", `!${hook}`]);
    await fx.git(["config", "alias.rev-parse", `!${hook}`]);
    await fx.git(["config", "core.pager", hook]);
    await fx.git(["config", "pager.status", hook]);
    await fx.git(["config", "core.hooksPath", fx.base]);
    await fx.git(["config", "diff.evil.textconv", hook]);
    await fx.git(["config", "core.editor", hook]);
    await fx.git(["config", "core.sshCommand", hook]);
    await fx.commitAll();
    await fx.write("locales/de.json", '{"a":"b"}\n');

    await clearMarker(fx);
    const status = await localeGitStatus({ config: baseConfig(), cwd: fx.root });

    expect(status).toMatchObject({ files: [{ path: "locales/de.json", state: "modified" }] });
    expect(await fx.exists("marker")).toBe(false);
  });
});

describe("openGitWorkTree", () => {
  it("opens a repository with the commit at HEAD and an empty prefix at the root", async () => {
    const fx = await committedProject();

    const opened = await openGitWorkTree(defaultGitExecFile, fx.root);

    expect(opened.ok && opened.tree.prefix).toBe("");
    expect(opened.ok && opened.tree.head).toMatch(/^[0-9a-f]{40,64}$/);
  });

  it("keeps a prefix whose directory name contains a newline", async () => {
    const fx = await committedProject();
    await fx.write("sub\ndir/x.txt", "x\n");

    const opened = await openGitWorkTree(defaultGitExecFile, join(fx.root, "sub\ndir"));

    expect(opened.ok && opened.tree.prefix).toBe("sub\ndir/");
  });

  it("reads a probe answer without a trailing newline", async () => {
    const execFile: GitExecFile = async () => ({ stdout: "false", stderr: "" });

    expect(await openGitWorkTree(execFile, "/project")).toEqual({
      ok: false,
      reason: "not-a-repository",
    });
  });

  it("has no head on a branch with no commits", async () => {
    const fx = await makeGitFixture();
    fixtures.push(fx);

    const opened = await openGitWorkTree(defaultGitExecFile, fx.root);

    expect(opened.ok && opened.tree.head).toBeUndefined();
  });
});

describe("a filter named so that a -c override could miss it", () => {
  const SAME_SIZE_EDIT = '{"a":"b"}\n';

  async function trapped(name: Buffer, attribute: Buffer): Promise<GitFixture> {
    const fx = await committedProject();
    const clean = await script(fx, "clean.sh", markerBody(fx, "cat"));
    await writeFile(
      join(fx.root, ".gitattributes"),
      Buffer.concat([Buffer.from("*.json filter="), attribute, Buffer.from("\n")]),
    );
    await fx.commitAll();
    await appendFile(
      join(fx.root, ".git", "config"),
      Buffer.concat([
        Buffer.from('[filter "'),
        name,
        Buffer.from(`"]\n\tclean = ${clean}\n\trequired = true\n`),
      ]),
    );
    await fx.write("locales/de.json", SAME_SIZE_EDIT);
    return fx;
  }

  it.each([
    ["an empty name", Buffer.from("")],
    ["a line separator", Buffer.from("a b")],
    ["a dot", Buffer.from("a.b")],
  ])("is neutralised with %s, and a plain status runs it", async (_label, name) => {
    const fx = await trapped(name, name);
    await clearMarker(fx);
    await fx.git(["status", "--porcelain"]).catch(() => undefined);
    const plainRan = await fx.exists("marker");
    await clearMarker(fx);

    const status = await localeGitStatus({ config: baseConfig(), cwd: fx.root });

    expect(plainRan).toBe(true);
    expect(status).toMatchObject({ files: [{ path: "locales/de.json", state: "modified" }] });
    expect(await fx.exists("marker")).toBe(false);
  });

  it("is refused when the name is not valid text, and nothing runs", async () => {
    const bytes = Buffer.from([0x61, 0xff, 0x62]);
    const fx = await trapped(bytes, bytes);
    await clearMarker(fx);
    await fx.git(["status", "--porcelain"]).catch(() => undefined);
    const plainRan = await fx.exists("marker");
    await clearMarker(fx);

    const status = await localeGitStatus({ config: baseConfig(), cwd: fx.root });

    expect(plainRan).toBe(true);
    expect(status).toEqual({ available: false, reason: "unsafe-config" });
    expect(await fx.exists("marker")).toBe(false);
  });
});

describe("a head that is not a branch with no commits", () => {
  async function broken(corrupt: (fx: GitFixture) => Promise<void>): Promise<GitFixture> {
    const fx = await committedProject();
    await corrupt(fx);
    return fx;
  }

  const CORRUPTIONS: readonly [string, (fx: GitFixture) => Promise<void>][] = [
    ["an empty branch file", (fx) => writeFile(join(fx.root, ".git", "refs", "heads", "main"), "")],
    [
      "a branch pointing at nothing",
      (fx) => writeFile(join(fx.root, ".git", "refs", "heads", "main"), `${"1".repeat(40)}\n`),
    ],
    [
      "a detached head pointing at nothing",
      (fx) => writeFile(join(fx.root, ".git", "HEAD"), `${"1".repeat(40)}\n`),
    ],
  ];

  it.each(CORRUPTIONS)("is a failure, for status and diff alike: %s", async (_label, corrupt) => {
    const fx = await broken(corrupt);

    const status = await localeGitStatus({ config: baseConfig(), cwd: fx.root });
    const diff = await localeGitDiff({ config: baseConfig(), cwd: fx.root, locale: "de" });

    expect(status).toEqual({ available: false, reason: "git-failed" });
    expect(diff).toEqual({ available: false, reason: "git-failed" });
  });

  it("is told apart from a real unborn branch, which both calls answer", async () => {
    const fx = await makeGitFixture();
    fixtures.push(fx);
    await fx.write("locales/de.json", '{"a":"a"}\n');

    const status = await localeGitStatus({ config: baseConfig(), cwd: fx.root });
    const diff = await localeGitDiff({ config: baseConfig(), cwd: fx.root, locale: "de" });

    expect(status).toMatchObject({ available: true, branch: "main" });
    expect(diff).toMatchObject({ available: true, state: "untracked" });
  });

  it("is not a branch with no commits when the head names something outside refs", async () => {
    const execFile: GitExecFile = vi
      .fn()
      .mockResolvedValueOnce({ stdout: "true\n", stderr: "" })
      .mockResolvedValueOnce({ stdout: "", stderr: "" })
      .mockRejectedValueOnce(Object.assign(new Error("x"), { code: 1, stderr: "" }))
      .mockResolvedValueOnce({ stdout: "HEAD-elsewhere\n", stderr: "" });

    expect(await openGitWorkTree(execFile, "/p")).toEqual({ ok: false, reason: "git-failed" });
  });

  it("reports a failure of the reference lookup", async () => {
    const execFile: GitExecFile = vi
      .fn()
      .mockResolvedValueOnce({ stdout: "true\n", stderr: "" })
      .mockResolvedValueOnce({ stdout: "", stderr: "" })
      .mockRejectedValueOnce(Object.assign(new Error("x"), { code: 1, stderr: "" }))
      .mockResolvedValueOnce({ stdout: "refs/heads/main\n", stderr: "" })
      .mockRejectedValueOnce(Object.assign(new Error("x"), { killed: true, signal: "SIGKILL" }));

    expect(await openGitWorkTree(execFile, "/p")).toEqual({ ok: false, reason: "timeout" });
  });

  it("reports a failure of the symbolic reference lookup", async () => {
    const execFile: GitExecFile = vi
      .fn()
      .mockResolvedValueOnce({ stdout: "true\n", stderr: "" })
      .mockResolvedValueOnce({ stdout: "", stderr: "" })
      .mockRejectedValueOnce(Object.assign(new Error("x"), { code: 1, stderr: "" }))
      .mockRejectedValueOnce(Object.assign(new Error("x"), { code: "ENOENT" }));

    expect(await openGitWorkTree(execFile, "/p")).toEqual({ ok: false, reason: "git-missing" });
  });

  it("is not a branch with no commits when the symbolic lookup exits silently", async () => {
    const execFile: GitExecFile = vi
      .fn()
      .mockResolvedValueOnce({ stdout: "true\n", stderr: "" })
      .mockResolvedValueOnce({ stdout: "", stderr: "" })
      .mockRejectedValueOnce(Object.assign(new Error("x"), { code: 1, stderr: "" }))
      .mockRejectedValueOnce(Object.assign(new Error("x"), { code: 1, stderr: "" }));

    expect(await openGitWorkTree(execFile, "/p")).toEqual({ ok: false, reason: "git-failed" });
  });

  it("is not a branch with no commits when the reference exists after all", async () => {
    const execFile: GitExecFile = vi
      .fn()
      .mockResolvedValueOnce({ stdout: "true\n", stderr: "" })
      .mockResolvedValueOnce({ stdout: "", stderr: "" })
      .mockRejectedValueOnce(Object.assign(new Error("x"), { code: 1, stderr: "" }))
      .mockResolvedValueOnce({ stdout: "refs/heads/main\n", stderr: "" })
      .mockResolvedValueOnce({ stdout: "", stderr: "" });

    expect(await openGitWorkTree(execFile, "/p")).toEqual({ ok: false, reason: "git-failed" });
  });
});
