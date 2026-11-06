import { execFile as execFileCb } from "node:child_process";
import { chmod, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { type GitFixture, makeGitFixture } from "../git-fixture.js";
import { baseConfig } from "../test-support.js";
import { defaultGitExecFile } from "./git-exec.js";
import { localeGitStatus } from "./git-status.js";
import { neutralizeFilters, openGitWorkTree } from "./git-worktree.js";

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

describe("neutralizeFilters", () => {
  it("blanks clean and process and clears required for every named driver once", () => {
    const result = neutralizeFilters(
      "core.bare\0filter.lfs.clean\0filter.lfs.smudge\0filter.lfs.required\0filter.Evil.process\0",
    );

    expect(result).toEqual({
      ok: true,
      args: [
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

  it("keeps a dotted driver name whole", () => {
    expect(neutralizeFilters("filter.a.b.clean\0")).toMatchObject({
      ok: true,
      args: expect.arrayContaining(["filter.a.b.clean="]),
    });
  });

  it("returns no overrides when no filter is configured", () => {
    expect(neutralizeFilters("core.bare\0user.name\0")).toEqual({ ok: true, args: [] });
  });

  it("refuses a driver name that -c would split at an equals sign", () => {
    expect(neutralizeFilters("filter.a=b.clean\0")).toEqual({ ok: false });
  });
});

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

  it("has no head on a branch with no commits", async () => {
    const fx = await makeGitFixture();
    fixtures.push(fx);

    const opened = await openGitWorkTree(defaultGitExecFile, fx.root);

    expect(opened.ok && opened.tree.head).toBeUndefined();
  });
});
