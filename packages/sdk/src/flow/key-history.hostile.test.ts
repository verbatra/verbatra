import { chmod, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { baseConfig, type GitFixture, makeGitFixture } from "../test-support.js";
import { defaultGitExecFile, type GitExecFile } from "./git-exec.js";
import { LOCALE_GIT_BLOB_MAX_BYTES } from "./git-revision.js";
import { type KeyHistoryResult, keyHistory } from "./key-history.js";
import { localeHistory } from "./locale-history.js";

const fixtures: GitFixture[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
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

function available(result: KeyHistoryResult): Extract<KeyHistoryResult, { available: true }> {
  if (!result.available) {
    throw new Error(`unavailable: ${result.reason}`);
  }
  return result;
}

function run(fx: GitFixture, key = "a", execFile?: GitExecFile, config = baseConfig()) {
  return keyHistory(
    { config, cwd: fx.root, locale: "de", key },
    execFile === undefined ? {} : { execFile },
  );
}

describe("keyHistory over a hostile history", () => {
  it("steps over an old revision the adapter cannot parse and counts it", async () => {
    const fx = await repo();
    await fx.write("locales/de.json", json({ a: "one" }));
    await fx.commitAll("good one");
    await fx.write("locales/de.json", "<<<<<<< HEAD\n{ not json\n");
    await fx.commitAll("conflict markers committed");
    await fx.write("locales/de.json", json({ a: "two" }));
    await fx.commitAll("good two");

    const result = available(await run(fx));

    expect(result.unreadableRevisions).toBe(1);
    expect(result.revisions.map((revision) => revision.value)).toEqual(["two", "one"]);
    expect(result.revisions[0]?.diff).toEqual([
      { kind: "removed", text: "one" },
      { kind: "added", text: "two" },
    ]);
  });

  it("does not list a revision whose only older readable neighbour has the same value", async () => {
    const fx = await repo();
    await fx.write("locales/de.json", json({ a: "same" }));
    await fx.commitAll("first");
    await fx.write("locales/de.json", "garbage");
    await fx.commitAll("broken");
    await fx.write("locales/de.json", json({ a: "same" }));
    await fx.commitAll("fixed to the same value");

    const result = available(await run(fx));

    expect(result.revisions.map((revision) => revision.subject)).toEqual(["first"]);
  });

  it("counts a committed file above the blob bound as unreadable without reading it", async () => {
    const fx = await repo();
    await fx.write("locales/de.json", json({ a: "one" }));
    await fx.commitAll("small");
    await fx.write("locales/de.json", json({ a: "x".repeat(LOCALE_GIT_BLOB_MAX_BYTES + 10) }));
    await fx.commitAll("huge blob");
    await fx.write("locales/de.json", json({ a: "two" }));
    await fx.commitAll("small again");

    const result = available(await run(fx));

    expect(result.unreadableRevisions).toBe(1);
    expect(result.revisions.map((revision) => revision.value)).toEqual(["two", "one"]);
  });

  it("counts a committed symbolic link as unreadable", async () => {
    const fx = await repo();
    await fx.write("locales/de.json", json({ a: "one" }));
    await fx.commitAll("file");
    await rm(join(fx.root, "locales/de.json"));
    await symlink("/etc/hostname", join(fx.root, "locales/de.json"));
    await fx.commitAll("link");
    await rm(join(fx.root, "locales/de.json"));
    await fx.write("locales/de.json", json({ a: "two" }));
    await fx.commitAll("file again");

    const result = available(await run(fx));

    expect(result.unreadableRevisions).toBe(1);
    expect(result.revisions.map((revision) => revision.value)).toEqual(["two", "one"]);
  });

  it("strips control and bidirectional characters and cuts a very long subject and author", async () => {
    const fx = await repo();
    await fx.write("locales/de.json", json({ a: "one" }));
    await fx.git(["add", "-A"]);
    const subject = `‮gnp.exe\u001b[31m${"s".repeat(100_000)}`;
    const author = `Eve‮⁦${"n".repeat(5000)}`;
    await fx.git(["commit", "-q", "-m", subject, `--author=${author} <eve@example.com>`]);

    const result = available(await run(fx));

    const revision = result.revisions[0];
    expect(revision?.subject).not.toMatch(/[\p{Cc}\p{Cf}]/u);
    expect(revision?.subject.length).toBe(500);
    expect(revision?.author).not.toMatch(/[\p{Cc}\p{Cf}]/u);
    expect(revision?.author.length).toBe(200);
    expect(JSON.stringify(result)).not.toContain("eve@example.com");
  });

  it("never splits a surrogate pair when it cuts a subject", async () => {
    const fx = await repo();
    await fx.write("locales/de.json", json({ a: "one" }));
    await fx.git(["add", "-A"]);
    await fx.git(["commit", "-q", "-m", `${"s".repeat(499)}😀tail`]);

    const subject = available(await run(fx)).revisions[0]?.subject ?? "";

    expect(subject).toBe("s".repeat(499));
  });

  it("is not slowed by a commit that touches thousands of other files", async () => {
    const fx = await repo();
    await fx.write("locales/de.json", json({ a: "one" }));
    await fx.commitAll("small");
    for (let index = 0; index < 1500; index += 1) {
      await fx.write(`bulk/file-${index}.txt`, String(index));
    }
    await fx.write("locales/de.json", json({ a: "two" }));
    await fx.commitAll("huge commit");

    const result = available(await run(fx));

    expect(result.revisions.map((revision) => revision.value)).toEqual(["two", "one"]);
  });

  it("reads a committed file missing from a partial clone as unreadable and fetches nothing", async () => {
    const fx = await repo();
    const marker = join(fx.base, "pcmark");
    const script = join(fx.base, "uploadpack.sh");
    await fx.write("locales/de.json", json({ a: "one" }));
    await fx.commitAll("one");
    await fx.write("locales/de.json", json({ a: "two" }));
    await fx.commitAll("two");
    const first = (await fx.git(["rev-parse", "HEAD~1:locales/de.json"])).trim();
    await rm(join(fx.root, ".git", "objects", first.slice(0, 2), first.slice(2)));
    await writeFile(script, `#!/bin/sh\necho ran >> "${marker}"\nexit 1\n`, { mode: 0o755 });
    await chmod(script, 0o755);
    await fx.git(["config", "core.repositoryformatversion", "1"]);
    await fx.git(["config", "extensions.partialclone", "origin"]);
    await fx.git(["config", "remote.origin.promisor", "true"]);
    await fx.git(["config", "remote.origin.url", join(fx.base, "nowhere")]);
    await fx.git(["config", "remote.origin.uploadpack", script]);

    const result = available(await run(fx));

    expect(result.unreadableRevisions).toBe(1);
    expect(result.revisions.map((revision) => revision.value)).toEqual(["two"]);
    expect(await fx.exists("pcmark")).toBe(false);
  });

  it("runs no filter driver, text conversion driver or hook the repository configures", async () => {
    const fx = await repo();
    const hook = join(fx.base, "hook.sh");
    await writeFile(hook, `#!/bin/sh\necho ran >> "${join(fx.base, "marker")}"\nexit 0\n`);
    await chmod(hook, 0o755);
    await fx.write(".gitattributes", "*.json filter=evil diff=evil\n");
    await fx.write("locales/de.json", json({ a: "one" }));
    await fx.commitAll("one");
    await fx.git(["config", "diff.evil.textconv", hook]);
    await fx.git(["config", "filter.evil.smudge", hook]);
    await fx.git(["config", "filter.evil.clean", hook]);
    await fx.git(["config", "filter.evil.process", hook]);
    await fx.git(["config", "core.fsmonitor", hook]);
    await fx.git(["config", "core.pager", hook]);
    await fx.write("locales/de.json", json({ a: "control" }));
    await fx.git(["status", "--porcelain"]).catch(() => undefined);
    expect(await fx.exists("marker")).toBe(true);
    await rm(join(fx.base, "marker"), { force: true });
    await fx.write("locales/de.json", json({ a: "two" }));

    const result = available(await run(fx));

    expect(result.revisions.map((revision) => revision.value)).toEqual(["one"]);
    expect(await fx.exists("marker")).toBe(false);
  });

  it("refuses a working file that is a symbolic link", async () => {
    const fx = await repo();
    await fx.write("locales/de.json", json({ a: "one" }));
    await fx.commitAll("one");
    await rm(join(fx.root, "locales/de.json"));
    await writeFile(join(fx.base, "outside.json"), json({ a: "outside" }));
    await symlink(join(fx.base, "outside.json"), join(fx.root, "locales/de.json"));

    expect(await run(fx)).toEqual({ available: false, reason: "working-file-unreadable" });
  });

  it("refuses a locale directory that is a symbolic link to outside", async () => {
    const fx = await repo();
    await fx.write("locales/de.json", json({ a: "one" }));
    await fx.commitAll("one");
    await rm(join(fx.root, "locales"), { recursive: true });
    await mkdir(join(fx.base, "elsewhere"));
    await writeFile(join(fx.base, "elsewhere/de.json"), json({ a: "outside" }));
    await symlink(join(fx.base, "elsewhere"), join(fx.root, "locales"));

    expect(await run(fx)).toEqual({ available: false, reason: "working-file-unreadable" });
  });

  it("treats __proto__ as an ordinary key and leaves the prototype alone", async () => {
    const fx = await repo();
    await fx.write("locales/de.json", `{"__proto__": "polluted", "a": "x"}\n`);
    await fx.write(
      "verbatra.lock.json",
      `{"version":1,"locales":{"__proto__":{"__proto__":"x"},"de":{"__proto__":"abc"}}}\n`,
    );
    await fx.write(
      "verbatra.provenance.json",
      `{"version":1,"locales":{"__proto__":{"__proto__":{"origin":"human","valueHash":"x"}}}}\n`,
    );
    await fx.commitAll("one");

    const result = await run(fx, "__proto__");

    expect(result.available).toBe(true);
    expect(({} as Record<string, unknown>).origin).toBeUndefined();
    expect(Object.keys(Object.prototype)).toEqual([]);
  });

  it("answers sourceChanged unknown for a lock-file above the blob bound without failing", async () => {
    const fx = await repo();
    await fx.write("locales/de.json", json({ a: "one" }));
    await fx.write("verbatra.lock.json", `${"x".repeat(LOCALE_GIT_BLOB_MAX_BYTES + 1)}\n`);
    await fx.commitAll("one");

    const result = available(await run(fx));

    expect(result.revisions[0]).toMatchObject({ value: "one", sourceChanged: "unknown" });
    expect(result.revisions[0]?.origin).toBe("unrecorded");
  });
});

describe("keyHistory deadline", () => {
  async function nine(): Promise<GitFixture> {
    const fx = await repo();
    for (const value of ["1", "2", "3", "4", "5", "6", "7", "8", "9"]) {
      await fx.write("locales/de.json", json({ a: value }));
      await fx.commitAll(`set ${value}`);
    }
    return fx;
  }

  function clockJumpingOn(match: (args: readonly string[]) => boolean): GitExecFile {
    let offset = 0;
    vi.spyOn(Date, "now").mockImplementation(() => 1_000_000 + offset);
    return (file, args, options) => {
      if (match(args)) {
        offset = 10 * 60 * 1000;
      }
      return defaultGitExecFile(file, args, options);
    };
  }

  it("stops reading older commits, lists only the ones it can compare and says it is truncated", async () => {
    const fx = await nine();
    const execFile = clockJumpingOn((args) => args.includes("cat-file"));

    const result = available(await run(fx, "a", execFile));

    expect(result.truncated).toBe(true);
    expect(result.revisions.length).toBeGreaterThan(0);
    expect(result.revisions.length).toBeLessThan(9);
    expect(result.revisions[0]?.value).toBe("9");
  });

  it("returns revisions without origin and with sourceChanged unknown once it ran out of time reading their records", async () => {
    const fx = await nine();
    await fx.write(
      "verbatra.lock.json",
      `${JSON.stringify({ version: 1, locales: { de: {} } })}\n`,
    );
    await fx.commitAll("lock");
    const execFile = clockJumpingOn((args) =>
      args.some((arg) => arg.endsWith(":verbatra.lock.json") || arg === "verbatra.lock.json"),
    );

    const result = available(await run(fx, "a", execFile));

    const late = result.revisions.slice(-2);
    expect(result.revisions.length).toBe(9);
    expect(result.truncated).toBe(false);
    expect(result.revisions[0]?.origin).toBe("unrecorded");
    for (const revision of late) {
      expect(revision.origin).toBeUndefined();
      expect(revision.sourceChanged).toBe("unknown");
    }
  });
});

describe("a repository that sets a log output encoding", () => {
  it("still lists every commit in keyHistory and localeHistory, and plain git log would not", async () => {
    const fx = await repo();
    await fx.write("locales/de.json", json({ a: "Grüße" }));
    await fx.commitAll("Grüße");
    await fx.git(["config", "i18n.logOutputEncoding", "UTF-16"]);

    const plain = await fx.git(["log", "--format=%s"]);
    const keyed = available(await run(fx));
    const listed = await localeHistory({ config: baseConfig(), cwd: fx.root });

    expect(plain.trim()).not.toBe("Grüße");
    expect(keyed.revisions.map((revision) => revision.subject)).toEqual(["Grüße"]);
    expect(listed).toMatchObject({ available: true, commits: [{ subject: "Grüße" }] });
  });
});

describe("keyHistory limit on the wire", () => {
  it("asks git for one commit more than the capped limit, never more", async () => {
    const fx = await repo();
    await fx.write("locales/de.json", json({ a: "one" }));
    await fx.commitAll("one");
    const seen: string[] = [];
    const execFile: GitExecFile = (file, args, options) => {
      seen.push(...args);
      return defaultGitExecFile(file, args, options);
    };

    await keyHistory(
      { config: baseConfig(), cwd: fx.root, locale: "de", key: "a", limit: 1_000_000 },
      { execFile },
    );

    expect(seen).toContain("--max-count=201");
    expect(seen).toContain("--first-parent");
    expect(seen).toContain("log.follow=false");
    expect(seen).toContain("--no-show-signature");
    expect(seen.some((arg) => arg.startsWith("--format=") && arg.includes("%aN"))).toBe(true);
    expect(seen.some((arg) => /%a[eE]/.test(arg))).toBe(false);
  });
});

describe("localeHistory reasons a repository can now give", () => {
  it("answers unsafe-config for a filter whose name cannot be passed to git", async () => {
    const fx = await repo();
    await fx.write(".gitattributes", "*.json filter=a=b\n");
    await fx.write("locales/de.json", json({ a: "one" }));
    await fx.git(["config", "filter.a=b.clean", "cat"]);
    await fx.commitAll("one");

    const history = await localeHistory({ config: baseConfig(), cwd: fx.root });

    expect(history).toEqual({ available: false, reason: "unsafe-config" });
  });

  it("answers git-too-old for a partial clone on a git without --no-lazy-fetch", async () => {
    const execFile = vi.fn(async (_file: string, args: readonly string[]) => {
      if (args.includes("--no-lazy-fetch")) {
        throw Object.assign(new Error("x"), {
          code: 129,
          stderr: "unknown option: --no-lazy-fetch",
        });
      }
      return { stdout: "extensions.partialclone\0", stderr: "" };
    });

    const history = await localeHistory(
      { config: baseConfig(), cwd: "/project" },
      { execFile: execFile as unknown as GitExecFile },
    );

    expect(history).toEqual({ available: false, reason: "git-too-old" });
  });

  it("still reads a branch with no commits as an empty history", async () => {
    const fx = await repo();

    const history = await localeHistory({ config: baseConfig(), cwd: fx.root });

    expect(history).toEqual({ available: true, commits: [] });
  });
});
