import { chmod, mkdir, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createDefaultRegistry } from "@verbatra/format-adapters";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SdkError } from "../errors.js";
import { defaultFs } from "../fs.js";
import { baseConfig, type GitFixture, makeGitFixture } from "../test-support.js";
import {
  compareResources,
  fileKind,
  LOCALE_GIT_DIFF_MAX_ENTRIES,
  LOCALE_GIT_DIFF_MAX_VALUE_CHARS,
  localeGitDiff,
  workingFileKind,
} from "./git-diff.js";
import { defaultGitExecFile, type GitExecFile, gitExecFileWith } from "./git-exec.js";
import { LOCALE_GIT_BLOB_MAX_BYTES } from "./git-revision.js";

const fixtures: GitFixture[] = [];

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((created) => created.cleanup()));
});

async function repo(): Promise<GitFixture> {
  const fx = await makeGitFixture();
  fixtures.push(fx);
  return fx;
}

function json(values: Record<string, string>): string {
  return `${JSON.stringify(values, null, 2)}\n`;
}

function entries(values: Record<string, string>): Map<string, { value: string }> {
  return new Map(Object.entries(values).map(([key, value]) => [key, { value }]));
}

describe("compareResources", () => {
  it("lists added, removed and changed keys in order", () => {
    const body = compareResources(
      entries({ a: "1", b: "2", c: "3" }),
      entries({ b: "2", c: "changed", d: "4" }),
    );

    expect(body).toEqual({
      added: [{ key: "d", value: "4" }],
      removed: [{ key: "a", value: "1" }],
      changed: [{ key: "c", before: "3", after: "changed" }],
      truncated: false,
    });
  });

  it("treats a key named like a prototype member as an ordinary key", () => {
    const body = compareResources(
      entries({}),
      new Map([
        ["__proto__", { value: "x" }],
        ["constructor", { value: "y" }],
      ]),
    );

    expect(body.added.map((entry) => entry.key)).toEqual(["__proto__", "constructor"]);
  });

  it("stops at the entry cap and says so", () => {
    const many = Object.fromEntries(
      Array.from({ length: LOCALE_GIT_DIFF_MAX_ENTRIES + 5 }, (_, index) => [`k${index}`, "v"]),
    );

    const body = compareResources(entries({}), entries(many));

    expect(body.added).toHaveLength(LOCALE_GIT_DIFF_MAX_ENTRIES);
    expect(body.truncated).toBe(true);
  });

  it("counts removed and changed keys against the same cap", () => {
    const before = Object.fromEntries(
      Array.from({ length: LOCALE_GIT_DIFF_MAX_ENTRIES }, (_, index) => [`k${index}`, "a"]),
    );
    const after = Object.fromEntries(Object.keys(before).map((key) => [key, "b"]));

    const body = compareResources(entries({ ...before, gone: "x" }), entries(after));

    expect(body.changed).toHaveLength(LOCALE_GIT_DIFF_MAX_ENTRIES);
    expect(body.removed).toHaveLength(0);
    expect(body.truncated).toBe(true);
  });

  it("cuts a long text and never splits a surrogate pair", () => {
    const long = `${"x".repeat(LOCALE_GIT_DIFF_MAX_VALUE_CHARS - 1)}\u{1F600}tail`;

    const body = compareResources(entries({}), entries({ k: long }));

    expect(body.added[0]?.value).toBe("x".repeat(LOCALE_GIT_DIFF_MAX_VALUE_CHARS - 1));
    expect(body.truncated).toBe(true);
  });

  it("cuts after a character above the surrogate range without dropping it", () => {
    const text = `${"x".repeat(LOCALE_GIT_DIFF_MAX_VALUE_CHARS - 1)}\uE000tail`;

    const body = compareResources(entries({}), entries({ k: text }));

    expect(body.added[0]?.value).toBe(`${"x".repeat(LOCALE_GIT_DIFF_MAX_VALUE_CHARS - 1)}\uE000`);
  });

  it("keeps a text exactly at the limit whole", () => {
    const exact = "y".repeat(LOCALE_GIT_DIFF_MAX_VALUE_CHARS);

    const body = compareResources(entries({}), entries({ k: exact }));

    expect(body.added[0]?.value).toBe(exact);
    expect(body.truncated).toBe(false);
  });
});

describe("fileKind", () => {
  it("tells a regular file from a symbolic link, a directory and a missing path", async () => {
    const fx = await repo();
    await fx.write("a.json", "{}\n");
    await fx.write("dir/x.json", "{}\n");
    await symlink(join(fx.root, "a.json"), join(fx.root, "link.json"));

    expect(await fileKind(join(fx.root, "a.json"))).toBe("file");
    expect(await fileKind(join(fx.root, "link.json"))).toBe("other");
    expect(await fileKind(join(fx.root, "dir"))).toBe("other");
    expect(await fileKind(join(fx.root, "none.json"))).toBe("missing");
    expect(await fileKind(join(fx.root, "missing-dir", "a.json"))).toBe("missing");
  });

  it("reads a file as missing when the file-system seam cannot list a directory", async () => {
    const fx = await repo();
    await fx.write("a.json", "{}\n");
    const original = defaultFs.readDirectory;
    delete (defaultFs as { readDirectory?: unknown }).readDirectory;
    try {
      expect(await fileKind(join(fx.root, "a.json"))).toBe("missing");
    } finally {
      (defaultFs as { readDirectory?: unknown }).readDirectory = original;
    }
  });

  it("matches a differently cased name only when exactly one entry folds to it", async () => {
    const fx = await repo();
    await fx.write("only/De.json", "{}\n");
    await fx.write("both/De.json", "{}\n");
    await fx.write("both/dE.json", "{}\n");
    const names = await readdir(join(fx.root, "both"));
    const caseSensitive = names.length === 2;

    expect(await fileKind(join(fx.root, "only", "de.json"))).toBe("file");
    expect(await fileKind(join(fx.root, "both", "de.json"))).toBe(
      caseSensitive ? "missing" : "file",
    );
  });
});

describe("workingFileKind", () => {
  it("refuses a file behind a symbolic link in any parent, inside the project or out of it", async () => {
    const fx = await repo();
    await fx.write("real/de.json", "{}\n");
    await fx.write("outside/de.json", "{}\n", fx.base);
    await symlink(join(fx.root, "real"), join(fx.root, "inside"));
    await symlink(join(fx.base, "outside"), join(fx.root, "out"));
    await fx.write("deep/real/de.json", "{}\n");
    await symlink(join(fx.root, "deep", "real"), join(fx.root, "deep", "link"));

    expect(await workingFileKind(fx.root, join(fx.root, "real", "de.json"))).toBe("file");
    expect(await workingFileKind(fx.root, join(fx.root, "inside", "de.json"))).toBe("other");
    expect(await workingFileKind(fx.root, join(fx.root, "out", "de.json"))).toBe("other");
    expect(await workingFileKind(fx.root, join(fx.root, "deep", "link", "de.json"))).toBe("other");
  });

  it("reads a missing directory as missing, and a project root reached through a link as fine", async () => {
    const fx = await repo();
    await fx.write("real/de.json", "{}\n");
    const alias = join(fx.base, "alias");
    await symlink(fx.root, alias);

    expect(await workingFileKind(fx.root, join(fx.root, "nope", "de.json"))).toBe("missing");
    expect(await workingFileKind(alias, join(alias, "real", "de.json"))).toBe("file");
  });
});

describe("localeGitDiff against a real repository", () => {
  it("compares the committed file with the working file key by key", async () => {
    const fx = await repo();
    await fx.write("locales/en.json", json({ a: "A", b: "B", c: "C" }));
    await fx.write("locales/de.json", json({ a: "a", b: "b", c: "c" }));
    await fx.commitAll();
    await fx.write("locales/de.json", json({ a: "a2", c: "c", d: "d" }));

    const diff = await localeGitDiff({ config: baseConfig(), locale: "de", cwd: fx.root });

    expect(diff).toEqual({
      available: true,
      path: "locales/de.json",
      state: "modified",
      added: [{ key: "d", value: "d" }],
      removed: [{ key: "b", value: "b" }],
      changed: [{ key: "a", before: "a", after: "a2" }],
      truncated: false,
    });
  });

  it("compares the source locale too", async () => {
    const fx = await repo();
    await fx.write("locales/en.json", json({ a: "A" }));
    await fx.commitAll();
    await fx.write("locales/en.json", json({ a: "A2" }));

    const diff = await localeGitDiff({ config: baseConfig(), locale: "en", cwd: fx.root });

    expect(diff).toMatchObject({ changed: [{ key: "a", before: "A", after: "A2" }] });
  });

  it("reads the whole untracked file as added, and a repository with no commits the same", async () => {
    const fx = await repo();
    await fx.write("locales/de.json", json({ a: "a" }));

    const diff = await localeGitDiff({ config: baseConfig(), locale: "de", cwd: fx.root });

    expect(diff).toMatchObject({
      state: "untracked",
      added: [{ key: "a", value: "a" }],
      removed: [],
      changed: [],
    });
  });

  it("compares a file removed from the index but still on disk against HEAD", async () => {
    const fx = await repo();
    await fx.write("locales/de.json", json({ a: "a", b: "b" }));
    await fx.commitAll();
    await fx.git(["rm", "-q", "--cached", "locales/de.json"]);
    await fx.write("locales/de.json", json({ a: "a", b: "b2" }));

    const diff = await localeGitDiff({ config: baseConfig(), locale: "de", cwd: fx.root });

    expect(diff).toMatchObject({
      state: "modified",
      added: [],
      removed: [],
      changed: [{ key: "b", before: "b", after: "b2" }],
    });
  });

  it("shows a file taken out of the index as modified even when its content is unchanged", async () => {
    const fx = await repo();
    await fx.write("locales/de.json", json({ a: "a" }));
    await fx.commitAll();
    await fx.git(["rm", "-q", "--cached", "locales/de.json"]);

    const diff = await localeGitDiff({ config: baseConfig(), locale: "de", cwd: fx.root });

    expect(diff).toMatchObject({ state: "modified", added: [], removed: [], changed: [] });
  });

  it("refuses a file whose parent directory became a symbolic link to outside", async () => {
    const fx = await repo();
    await fx.write("locales/de.json", json({ a: "a" }));
    await fx.write("locales/en.json", json({ a: "A" }));
    await fx.commitAll();
    await fx.write("stolen/de.json", json({ a: "outside secret" }), fx.base);
    await rm(join(fx.root, "locales"), { recursive: true });
    await symlink(join(fx.base, "stolen"), join(fx.root, "locales"));

    const diff = await localeGitDiff({ config: baseConfig(), locale: "de", cwd: fx.root });

    expect(JSON.stringify(diff)).not.toContain("outside secret");
  });

  it("reads a committed file missing from a partial clone as unreadable and fetches nothing", async () => {
    const fx = await repo();
    const marker = join(fx.base, "pcmark");
    const script = join(fx.base, "uploadpack.sh");
    await fx.write("locales/de.json", json({ a: "a" }));
    await fx.commitAll();
    const hash = (await fx.git(["rev-parse", "HEAD:locales/de.json"])).trim();
    await rm(join(fx.root, ".git", "objects", hash.slice(0, 2), hash.slice(2)));
    await writeFile(script, `#!/bin/sh\necho ran >> "${marker}"\nexit 1\n`, { mode: 0o755 });
    await fx.git(["config", "core.repositoryformatversion", "1"]);
    await fx.git(["config", "extensions.partialclone", "origin"]);
    await fx.git(["config", "remote.origin.promisor", "true"]);
    await fx.git(["config", "remote.origin.url", join(fx.base, "nowhere")]);
    await fx.git(["config", "remote.origin.uploadpack", script]);
    await fx.write("locales/de.json", json({ a: "b" }));

    const diff = await localeGitDiff({ config: baseConfig(), locale: "de", cwd: fx.root });

    expect(diff).toEqual({ available: false, reason: "revision-unreadable" });
    expect(await fx.exists("pcmark")).toBe(false);
  });

  it("cuts a very long key and says so", async () => {
    const fx = await repo();
    await fx.write("locales/de.json", json({}));
    await fx.commitAll();
    await fx.write("locales/de.json", json({ ["k".repeat(10_000)]: "v" }));

    const diff = await localeGitDiff({ config: baseConfig(), locale: "de", cwd: fx.root });

    expect(diff.available && diff.added[0]?.key).toHaveLength(LOCALE_GIT_DIFF_MAX_VALUE_CHARS);
    expect(diff.available && diff.truncated).toBe(true);
  });

  it("bounds the whole result however many long keys and values differ", async () => {
    const fx = await repo();
    await fx.write("locales/de.json", json({}));
    await fx.commitAll();
    const many = Object.fromEntries(
      Array.from({ length: LOCALE_GIT_DIFF_MAX_ENTRIES + 50 }, (_, index) => [
        `${index}${"k".repeat(5000)}`,
        "v".repeat(5000),
      ]),
    );
    await fx.write("locales/de.json", json(many));

    const diff = await localeGitDiff({ config: baseConfig(), locale: "de", cwd: fx.root });

    expect(diff.available && diff.added).toHaveLength(LOCALE_GIT_DIFF_MAX_ENTRIES);
    expect(JSON.stringify(diff).length).toBeLessThan(
      LOCALE_GIT_DIFF_MAX_ENTRIES * 2 * (LOCALE_GIT_DIFF_MAX_VALUE_CHARS + 50),
    );
    expect(diff.available && diff.truncated).toBe(true);
  });

  it("reads a staged new file as added against nothing", async () => {
    const fx = await repo();
    await fx.write("locales/en.json", json({ z: "z" }));
    await fx.commitAll();
    await fx.write("locales/de.json", json({ a: "a" }));
    await fx.git(["add", "locales/de.json"]);

    const diff = await localeGitDiff({ config: baseConfig(), locale: "de", cwd: fx.root });

    expect(diff).toMatchObject({ state: "added", added: [{ key: "a", value: "a" }] });
  });

  it("reads a deleted file as every key removed", async () => {
    const fx = await repo();
    await fx.write("locales/de.json", json({ a: "a", b: "b" }));
    await fx.commitAll();
    await rm(join(fx.root, "locales/de.json"));

    const diff = await localeGitDiff({ config: baseConfig(), locale: "de", cwd: fx.root });

    expect(diff).toMatchObject({
      state: "deleted",
      removed: [
        { key: "a", value: "a" },
        { key: "b", value: "b" },
      ],
      added: [],
    });
  });

  it("lists no difference for an unchanged file", async () => {
    const fx = await repo();
    await fx.write("locales/de.json", json({ a: "a" }));
    await fx.commitAll();

    const diff = await localeGitDiff({ config: baseConfig(), locale: "de", cwd: fx.root });

    expect(diff).toEqual({
      available: true,
      path: "locales/de.json",
      state: "unchanged",
      added: [],
      removed: [],
      changed: [],
      truncated: false,
    });
  });

  it("lists no difference for a conflicted file", async () => {
    const fx = await repo();
    await fx.write("locales/de.json", json({ a: "base" }));
    await fx.commitAll();
    await fx.git(["checkout", "-q", "-b", "other"]);
    await fx.write("locales/de.json", json({ a: "other" }));
    await fx.commitAll("other");
    await fx.git(["checkout", "-q", "main"]);
    await fx.write("locales/de.json", json({ a: "main" }));
    await fx.commitAll("main");
    await fx.git(["merge", "other"]).catch(() => undefined);

    const diff = await localeGitDiff({ config: baseConfig(), locale: "de", cwd: fx.root });

    expect(diff).toMatchObject({ available: true, state: "conflicted", added: [], changed: [] });
  });

  it("reads a monorepo subdirectory from its own path, not the root's file of the same name", async () => {
    const fx = await repo();
    const app = join(fx.root, "packages", "app");
    await fx.write("locales/de.json", json({ a: "root" }));
    await fx.write("locales/de.json", json({ a: "app" }), app);
    await fx.commitAll();
    await fx.write("locales/de.json", json({ a: "app edited" }), app);

    const diff = await localeGitDiff({ config: baseConfig(), locale: "de", cwd: app });

    expect(diff).toMatchObject({
      path: "locales/de.json",
      changed: [{ key: "a", before: "app", after: "app edited" }],
    });
  });

  it("compares one locale of a shared catalogue", async () => {
    const fx = await repo();
    const catalogue = (de: string): string =>
      `${JSON.stringify({
        sourceLanguage: "en",
        version: "1.0",
        strings: {
          hi: {
            localizations: {
              en: { stringUnit: { state: "translated", value: "Hi" } },
              de: { stringUnit: { state: "translated", value: de } },
            },
          },
        },
      })}\n`;
    const config = baseConfig({
      format: "apple-xcstrings",
      files: { pattern: "{locale}Localizable.xcstrings" },
    });
    await fx.write("Localizable.xcstrings", catalogue("Hallo"));
    await fx.commitAll();
    await fx.write("Localizable.xcstrings", catalogue("Servus"));

    const german = await localeGitDiff({ config, locale: "de", cwd: fx.root });
    const english = await localeGitDiff({ config, locale: "en", cwd: fx.root });

    expect(german).toMatchObject({ changed: [{ key: "hi", before: "Hallo", after: "Servus" }] });
    expect(english).toMatchObject({ state: "modified", changed: [] });
  });

  it("never runs a git diff, a text conversion driver or an external diff", async () => {
    const fx = await repo();
    const hook = join(fx.base, "hook.sh");
    await writeFile(hook, `#!/bin/sh\necho ran >> "${join(fx.base, "marker")}"\ncat\n`);
    await chmod(hook, 0o755);
    await fx.write(".gitattributes", "*.json diff=evil\n");
    await fx.write("locales/de.json", json({ a: "a" }));
    await fx.git(["config", "diff.evil.textconv", hook]);
    await fx.git(["config", "diff.external", hook]);
    await fx.commitAll();
    await fx.write("locales/de.json", json({ a: "b" }));
    const calls: string[][] = [];
    const execFile: GitExecFile = (file, args, options) => {
      calls.push([...args]);
      return defaultGitExecFile(file, args, options);
    };

    const diff = await localeGitDiff(
      { config: baseConfig(), locale: "de", cwd: fx.root },
      { execFile },
    );

    expect(diff).toMatchObject({ changed: [{ key: "a", before: "a", after: "b" }] });
    expect(await fx.exists("marker")).toBe(false);
    const subcommands = calls.map((args) =>
      args.find((arg) => !arg.startsWith("-") && !arg.includes("=")),
    );
    expect(subcommands).not.toContain("diff");
    expect(subcommands).not.toContain("show");
    expect(subcommands).not.toContain("log");
  });
});

describe("localeGitDiff refusals", () => {
  it("throws for a locale that is not configured", async () => {
    await expect(
      localeGitDiff({ config: baseConfig(), locale: "xx", cwd: "/project" }),
    ).rejects.toBeInstanceOf(SdkError);
  });

  it("returns custom-adapter for a custom format without running git", async () => {
    const execFile = vi.fn();

    const diff = await localeGitDiff(
      { config: baseConfig({ format: "custom:mine" }), locale: "de", cwd: "/project" },
      { execFile: execFile as unknown as GitExecFile },
    );

    expect(diff).toEqual({ available: false, reason: "custom-adapter" });
    expect(execFile).not.toHaveBeenCalled();
  });

  it("returns custom-adapter when a registry is injected, even for a built-in format", async () => {
    const execFile = vi.fn();

    const diff = await localeGitDiff(
      { config: baseConfig(), locale: "de", cwd: "/project" },
      { execFile: execFile as unknown as GitExecFile, adapterRegistry: createDefaultRegistry() },
    );

    expect(diff).toEqual({ available: false, reason: "custom-adapter" });
    expect(execFile).not.toHaveBeenCalled();
  });

  it("returns working-file-unreadable for a locale file outside the project", async () => {
    const diff = await localeGitDiff({
      config: baseConfig({ files: { pattern: "../outside/{locale}.json" } }),
      locale: "de",
      cwd: "/project",
    });

    expect(diff).toEqual({ available: false, reason: "working-file-unreadable" });
  });

  it("returns the repository reason when git cannot be used", async () => {
    const execFile: GitExecFile = async () => {
      throw Object.assign(new Error("x"), { code: "ENOENT" });
    };

    const diff = await localeGitDiff(
      { config: baseConfig(), locale: "de", cwd: "/project" },
      { execFile },
    );

    expect(diff).toEqual({ available: false, reason: "git-missing" });
  });

  it("returns the reason when the status of the file cannot be read", async () => {
    const execFile: GitExecFile = vi
      .fn()
      .mockResolvedValueOnce({ stdout: "true\n", stderr: "" })
      .mockResolvedValueOnce({ stdout: "", stderr: "" })
      .mockResolvedValueOnce({ stdout: `${"a".repeat(40)}\n`, stderr: "" })
      .mockRejectedValueOnce(Object.assign(new Error("x"), { killed: true, signal: "SIGTERM" }));

    const diff = await localeGitDiff(
      { config: baseConfig(), locale: "de", cwd: "/project" },
      { execFile },
    );

    expect(diff).toEqual({ available: false, reason: "timeout" });
  });

  it("refuses a locale file that is a symbolic link on disk", async () => {
    const fx = await repo();
    await fx.write("locales/de.json", json({ a: "a" }));
    await fx.write("elsewhere.json", json({ a: "outside" }));
    await fx.commitAll();
    await rm(join(fx.root, "locales/de.json"));
    await symlink(join(fx.root, "elsewhere.json"), join(fx.root, "locales/de.json"));

    const diff = await localeGitDiff({ config: baseConfig(), locale: "de", cwd: fx.root });

    expect(diff).toEqual({ available: false, reason: "working-file-unreadable" });
  });

  it("refuses a working file that does not parse, conflict markers included", async () => {
    const fx = await repo();
    await fx.write("locales/de.json", json({ a: "a" }));
    await fx.commitAll();
    await fx.write("locales/de.json", '<<<<<<< HEAD\n{"a":"x"}\n=======\n{"a":"y"}\n>>>>>>> o\n');

    const diff = await localeGitDiff({ config: baseConfig(), locale: "de", cwd: fx.root });

    expect(diff).toEqual({ available: false, reason: "working-file-unreadable" });
  });

  it("refuses a committed file that does not parse", async () => {
    const fx = await repo();
    await fx.write("locales/de.json", "{ not json");
    await fx.commitAll();
    await fx.write("locales/de.json", json({ a: "a" }));

    const diff = await localeGitDiff({ config: baseConfig(), locale: "de", cwd: fx.root });

    expect(diff).toEqual({ available: false, reason: "revision-unreadable" });
  });

  it("refuses a committed symbolic link", async () => {
    const fx = await repo();
    await fx.write("real.json", json({ a: "a" }));
    await mkdir(join(fx.root, "locales"), { recursive: true });
    await symlink("../real.json", join(fx.root, "locales/de.json"));
    await fx.commitAll();
    await rm(join(fx.root, "locales/de.json"));
    await fx.write("locales/de.json", json({ a: "b" }));

    const diff = await localeGitDiff({ config: baseConfig(), locale: "de", cwd: fx.root });

    expect(diff).toEqual({ available: false, reason: "revision-unreadable" });
  });

  it("refuses a committed file larger than the bound", async () => {
    const fx = await repo();
    await fx.write("locales/de.json", "x".repeat(LOCALE_GIT_BLOB_MAX_BYTES + 1));
    await fx.commitAll();
    await fx.write("locales/de.json", json({ a: "a" }));

    const diff = await localeGitDiff({ config: baseConfig(), locale: "de", cwd: fx.root });

    expect(diff).toEqual({ available: false, reason: "output-too-large" });
  });

  it("reports a repository owned by another user", async () => {
    const fx = await repo();
    await fx.write("locales/de.json", json({ a: "a" }));
    await fx.commitAll();
    const execFile = gitExecFileWith({ GIT_TEST_ASSUME_DIFFERENT_OWNER: "1", HOME: fx.home });

    const diff = await localeGitDiff(
      { config: baseConfig(), locale: "de", cwd: fx.root },
      { execFile },
    );

    expect(diff).toEqual({ available: false, reason: "dubious-ownership" });
  });
});
