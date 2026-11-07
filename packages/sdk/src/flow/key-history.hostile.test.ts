import { chmod, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultFs } from "../fs.js";
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
  it("does not claim the commit after an old revision the adapter cannot parse, and says so", async () => {
    const fx = await repo();
    await fx.write("locales/de.json", json({ a: "one" }));
    await fx.commitAll("good one");
    await fx.write("locales/de.json", "<<<<<<< HEAD\n{ not json\n");
    await fx.commitAll("conflict markers committed");
    await fx.write("locales/de.json", json({ a: "two" }));
    await fx.commitAll("good two");

    const result = available(await run(fx));

    expect(result.unreadableRevisions).toBe(1);
    expect(result.truncated).toBe(true);
    expect(result.revisions.map((revision) => revision.value)).toEqual(["one"]);
  });

  it("does not list a revision whose older neighbour is unreadable, even when the older readable one holds the same value", async () => {
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
    expect(result.truncated).toBe(true);
    expect(result.revisions.map((revision) => revision.value)).toEqual(["one"]);
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
    expect(result.truncated).toBe(true);
    expect(result.revisions.map((revision) => revision.value)).toEqual(["one"]);
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
    expect(result.truncated).toBe(true);
    expect(result.revisions).toEqual([]);
    expect(await fx.exists("pcmark")).toBe(false);
  });

  it("never claims a first appearance for a key an unreadable older commit may already have held", async () => {
    const fx = await repo();
    await fx.write("locales/de.json", json({ a: "unchanged since the start", b: "b1" }));
    await fx.commitAll("a written here");
    await fx.write("locales/de.json", json({ a: "unchanged since the start", b: "b2" }));
    await fx.commitAll("only b changed");
    await fx.write("locales/de.json", json({ a: "unchanged since the start", b: "b3" }));
    await fx.commitAll("only b changed again");
    for (const spec of ["HEAD~2", "HEAD~1"]) {
      const hash = (await fx.git(["rev-parse", `${spec}:locales/de.json`])).trim();
      await rm(join(fx.root, ".git", "objects", hash.slice(0, 2), hash.slice(2)));
    }

    const result = available(await run(fx));

    expect(result.revisions).toEqual([]);
    expect(result.unreadableRevisions).toBe(2);
    expect(result.truncated).toBe(true);
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

  it("lists the revisions and flags the working file when it is a symbolic link", async () => {
    const fx = await repo();
    await fx.write("locales/de.json", json({ a: "one" }));
    await fx.commitAll("one");
    await rm(join(fx.root, "locales/de.json"));
    await writeFile(join(fx.base, "outside.json"), json({ a: "outside" }));
    await symlink(join(fx.base, "outside.json"), join(fx.root, "locales/de.json"));

    const result = available(await run(fx));

    expect(result.revisions.map((revision) => revision.value)).toEqual(["one"]);
    expect(result.workingTreeUnreadable).toBe(true);
    expect(result.workingTree).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain("outside");
  });

  it("lists the revisions and flags the working file when its directory is a symbolic link to outside", async () => {
    const fx = await repo();
    await fx.write("locales/de.json", json({ a: "one" }));
    await fx.commitAll("one");
    await rm(join(fx.root, "locales"), { recursive: true });
    await mkdir(join(fx.base, "elsewhere"));
    await writeFile(join(fx.base, "elsewhere/de.json"), json({ a: "outside" }));
    await symlink(join(fx.base, "elsewhere"), join(fx.root, "locales"));

    const result = available(await run(fx));

    expect(result.workingTreeUnreadable).toBe(true);
    expect(JSON.stringify(result)).not.toContain("outside");
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

describe("keyHistory with an oversized provenance file", () => {
  it("leaves the origin out instead of failing", async () => {
    const fx = await repo();
    await fx.write("locales/de.json", json({ a: "one" }));
    await fx.write("verbatra.provenance.json", `${"x".repeat(LOCALE_GIT_BLOB_MAX_BYTES + 1)}\n`);
    await fx.commitAll("one");

    const result = available(await run(fx));

    expect(result.revisions[0]?.value).toBe("one");
    expect(result.revisions[0]?.origin).toBeUndefined();
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
    let blobReads = 0;
    const execFile = clockJumpingOn((args) => args.includes("cat-file") && ++blobReads === 4);

    const result = available(await run(fx, "a", execFile));

    expect(result.truncated).toBe(true);
    expect(result.revisions.map((revision) => revision.value)).toEqual(["9", "8", "7"]);
  });

  it("starts no blob read after the deadline even when its tree entry was already listed", async () => {
    const fx = await nine();
    const calls: string[] = [];
    const inner = clockJumpingOn((args) => args.includes("ls-tree"));
    const execFile: GitExecFile = (file, args, options) => {
      calls.push(args.find((arg) => arg === "cat-file" || arg === "ls-tree") ?? "");
      return inner(file, args, options);
    };

    const result = available(await run(fx, "a", execFile));

    expect(calls.filter((call) => call === "cat-file")).toEqual([]);
    expect(result.revisions).toEqual([]);
    expect(result.truncated).toBe(true);
  });

  it("starts no is-shallow probe and no working tree read after the deadline", async () => {
    const fx = await nine();
    await fx.write("locales/de.json", json({ a: "edited" }));
    const seen: string[] = [];
    let reads = 0;
    const inner = clockJumpingOn((args) => args.includes("cat-file") && ++reads === 9);
    const execFile: GitExecFile = (file, args, options) => {
      seen.push(args.join(" "));
      return inner(file, args, options);
    };

    const result = available(await run(fx, "a", execFile));

    expect(seen.some((line) => line.includes("--is-shallow-repository"))).toBe(false);
    expect(seen.filter((line) => line.includes("ls-tree"))).toHaveLength(9);
    expect(result.workingTreeUnreadable).toBe(true);
    expect(result.workingTree).toBeUndefined();
    expect(result.truncated).toBe(true);
  });

  it("returns revisions without origin and with sourceChanged unknown once it ran out of time reading their records, and says so", async () => {
    const fx = await nine();
    await fx.write("locales/en.json", json({ a: "A" }));
    await fx.write(
      "verbatra.lock.json",
      `${JSON.stringify({ version: 1, locales: { de: {} } })}\n`,
    );
    await fx.commitAll("lock");
    const execFile = clockJumpingOn((args) =>
      args.some((arg) => arg.endsWith(":verbatra.lock.json") || arg === "verbatra.lock.json"),
    );

    const result = available(await run(fx, "a", execFile));

    expect(result.revisions.length).toBe(9);
    expect(result.truncated).toBe(true);
    for (const revision of result.revisions.slice(-2)) {
      expect(revision.origin).toBeUndefined();
      expect(revision.sourceChanged).toBe("unknown");
    }
  });

  it("starts no source read after the deadline and says the source was not read", async () => {
    const fx = await nine();
    await fx.write("locales/en.json", json({ a: "A" }));
    await fx.commitAll("source");
    const reads = vi.spyOn(defaultFs, "readFileBounded");
    let blobReads = 0;
    const execFile = clockJumpingOn((args) => args.includes("cat-file") && ++blobReads === 9);

    const result = available(await run(fx, "a", execFile));

    expect(reads.mock.calls.filter(([path]) => String(path).endsWith("en.json"))).toEqual([]);
    expect(result.revisions.length).toBeGreaterThan(0);
    expect(result.truncated).toBe(true);
  });
});

describe("keyHistory deadline during a git failure", () => {
  const timeoutFailure = Object.assign(new Error("slow"), { killed: true, signal: "SIGKILL" });

  async function two(): Promise<GitFixture> {
    const fx = await repo();
    for (const value of ["1", "2"]) {
      await fx.write("locales/de.json", json({ a: value }));
      await fx.commitAll(`set ${value}`);
    }
    return fx;
  }

  it("treats a size listing that timed out after the deadline as not reached, not as unreadable", async () => {
    const fx = await two();
    let offset = 0;
    vi.spyOn(Date, "now").mockImplementation(() => 1_000_000 + offset);
    const execFile: GitExecFile = (file, args, options) => {
      if (args.includes("ls-tree")) {
        offset = 10 * 60 * 1000;
        throw timeoutFailure;
      }
      return defaultGitExecFile(file, args, options);
    };

    const result = available(await run(fx, "a", execFile));

    expect(result.revisions).toEqual([]);
    expect(result.unreadableRevisions).toBe(0);
    expect(result.truncated).toBe(true);
  });

  it("treats a blob read that timed out after the deadline as not reached, not as unreadable", async () => {
    const fx = await two();
    let offset = 0;
    vi.spyOn(Date, "now").mockImplementation(() => 1_000_000 + offset);
    const execFile: GitExecFile = (file, args, options) => {
      if (args.includes("cat-file")) {
        offset = 10 * 60 * 1000;
        throw timeoutFailure;
      }
      return defaultGitExecFile(file, args, options);
    };

    const result = available(await run(fx, "a", execFile));

    expect(result.revisions).toEqual([]);
    expect(result.unreadableRevisions).toBe(0);
    expect(result.truncated).toBe(true);
  });

  it("reads no provenance file once the deadline passed while the lock file was read", async () => {
    const fx = await repo();
    await fx.write("locales/en.json", json({ a: "A" }));
    await fx.write("locales/de.json", json({ a: "1" }));
    await fx.write(
      "verbatra.lock.json",
      `${JSON.stringify({ version: 1, locales: { de: {} } })}\n`,
    );
    await fx.write("verbatra.provenance.json", `${JSON.stringify({ version: 1, locales: {} })}\n`);
    await fx.commitAll("one");
    let offset = 0;
    vi.spyOn(Date, "now").mockImplementation(() => 1_000_000 + offset);
    const reads: string[] = [];
    const execFile: GitExecFile = (file, args, options) => {
      if (args.some((arg) => arg.endsWith(":verbatra.lock.json"))) {
        offset = 10 * 60 * 1000;
      }
      if (args.includes("cat-file")) {
        reads.push(args.join(" "));
      }
      return defaultGitExecFile(file, args, options);
    };

    const result = available(await run(fx, "a", execFile));

    expect(reads.some((line) => line.includes("verbatra.provenance.json"))).toBe(false);
    expect(result.revisions[0]).not.toHaveProperty("origin");
    expect(result.truncated).toBe(true);
  });

  it("counts a blob git could not read as unreadable and says so", async () => {
    const fx = await two();
    const execFile: GitExecFile = (file, args, options) => {
      if (args.includes("cat-file")) {
        throw Object.assign(new Error("bad object"), { code: 128, stderr: "fatal: bad object" });
      }
      return defaultGitExecFile(file, args, options);
    };

    const result = available(await run(fx, "a", execFile));

    expect(result.unreadableRevisions).toBe(2);
    expect(result.truncated).toBe(true);
  });

  it("starts no read of the second file of an apple-strings commit after the deadline", async () => {
    const fx = await repo();
    const config = baseConfig({
      format: "apple-strings",
      files: { pattern: "locales/{locale}.lproj/Localizable.strings" },
    });
    await fx.write("locales/de.lproj/Localizable.strings", '"a" = "x";\n');
    await fx.write(
      "locales/de.lproj/Localizable.stringsdict",
      '<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict></dict></plist>\n',
    );
    await fx.commitAll("pair");
    let offset = 0;
    vi.spyOn(Date, "now").mockImplementation(() => 1_000_000 + offset);
    const reads: string[] = [];
    const execFile: GitExecFile = (file, args, options) => {
      if (args.includes("cat-file")) {
        reads.push(args.join(" "));
        offset = 10 * 60 * 1000;
      }
      return defaultGitExecFile(file, args, options);
    };

    const result = available(await run(fx, "a", execFile, config));

    expect(reads).toHaveLength(1);
    expect(result.revisions).toEqual([]);
    expect(result.truncated).toBe(true);
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
