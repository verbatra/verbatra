import { join } from "node:path";
import { contentHash } from "@verbatra/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SdkError } from "../errors.js";
import { valueHash } from "../lock/provenance-file.js";
import { selectAdapter } from "../selection/select-adapter.js";
import { baseConfig, type GitFixture, makeGitFixture } from "../test-support.js";
import { defaultGitExecFile, type GitExecFile, gitExecFileWith } from "./git-exec.js";
import {
  KEY_HISTORY_MAX_KEY_CHARS,
  KEY_HISTORY_MAX_VALUE_CHARS,
  type KeyHistoryResult,
  type KeyRevision,
  keyHistory,
} from "./key-history.js";

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

async function sourceHashOf(fx: GitFixture, key: string): Promise<string> {
  const read = await selectAdapter("i18next-json").read(join(fx.root, "locales/en.json"), "en");
  return contentHash(read.resource.entries.get(key) as never);
}

function lockOf(hashes: Record<string, string>): string {
  return `${JSON.stringify({ version: 1, locales: { de: hashes } }, null, 2)}\n`;
}

function provenanceOf(records: Record<string, { origin: string; value: string }>): string {
  const locales = Object.fromEntries(
    Object.entries(records).map(([key, record]) => [
      key,
      { origin: record.origin, valueHash: valueHash(record.value) },
    ]),
  );
  return `${JSON.stringify({ version: 1, locales: { de: locales } }, null, 2)}\n`;
}

function available(result: KeyHistoryResult): Extract<KeyHistoryResult, { available: true }> {
  if (!result.available) {
    throw new Error(`unavailable: ${result.reason}`);
  }
  return result;
}

function values(revisions: readonly KeyRevision[]): string[] {
  return revisions.map((revision) => revision.value);
}

async function history(
  fx: GitFixture,
  key = "a",
  extra: { limit?: number; execFile?: GitExecFile; cwd?: string } = {},
): Promise<KeyHistoryResult> {
  return keyHistory(
    {
      config: baseConfig(),
      cwd: extra.cwd ?? fx.root,
      locale: "de",
      key,
      ...(extra.limit !== undefined ? { limit: extra.limit } : {}),
    },
    extra.execFile !== undefined ? { execFile: extra.execFile } : {},
  );
}

async function commitValues(fx: GitFixture, list: readonly string[]): Promise<void> {
  await fx.write("locales/en.json", json({ a: "A" }));
  for (const [index, value] of list.entries()) {
    await fx.write("locales/de.json", json({ a: value, other: String(index) }));
    await fx.commitAll(`set ${value}`);
  }
}

describe("keyHistory against a real repository", () => {
  it("lists the commits in which the value changed, newest first, with a word diff", async () => {
    const fx = await repo();
    await commitValues(fx, ["Hallo Welt", "Hallo schöne Welt", "Servus schöne Welt"]);

    const result = available(await history(fx));

    expect(values(result.revisions)).toEqual([
      "Servus schöne Welt",
      "Hallo schöne Welt",
      "Hallo Welt",
    ]);
    expect(result.revisions.map((revision) => revision.subject)).toEqual([
      "set Servus schöne Welt",
      "set Hallo schöne Welt",
      "set Hallo Welt",
    ]);
    expect(result.revisions[0]).toMatchObject({
      author: "Test User",
      diff: [
        { kind: "removed", text: "Hallo" },
        { kind: "added", text: "Servus" },
        { kind: "equal", text: " schöne Welt" },
      ],
    });
    expect(result.revisions[2]?.diff).toEqual([{ kind: "added", text: "Hallo Welt" }]);
    expect(result.revisions[0]?.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(result.revisions[0]?.authorDate).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(result).toMatchObject({ truncated: false, unreadableRevisions: 0 });
    expect(result.workingTree).toBeUndefined();
  });

  it("skips commits that changed only other keys", async () => {
    const fx = await repo();
    await fx.write("locales/de.json", json({ a: "x", b: "1" }));
    await fx.commitAll("first");
    await fx.write("locales/de.json", json({ a: "x", b: "2" }));
    await fx.commitAll("only b");

    const result = available(await history(fx));

    expect(result.revisions.map((revision) => revision.subject)).toEqual(["first"]);
  });

  it("follows a key that appears, disappears and returns", async () => {
    const fx = await repo();
    await fx.write("locales/de.json", json({ a: "x" }));
    await fx.commitAll("appears");
    await fx.write("locales/de.json", json({ b: "other" }));
    await fx.commitAll("disappears");
    await fx.write("locales/de.json", json({ a: "y", b: "other" }));
    await fx.commitAll("returns changed");
    await fx.write("locales/de.json", json({ a: "x", b: "other" }));
    await fx.commitAll("returns as before");

    const result = available(await history(fx));

    expect(result.revisions.map((revision) => [revision.subject, revision.value])).toEqual([
      ["returns as before", "x"],
      ["returns changed", "y"],
      ["appears", "x"],
    ]);
    expect(result.revisions[1]?.diff).toEqual([{ kind: "added", text: "y" }]);
  });

  it("lists a value that changed only in whitespace, and shows it", async () => {
    const fx = await repo();
    await fx.write("locales/de.json", json({ a: "Hallo Welt" }));
    await fx.commitAll("one space");
    await fx.write("locales/de.json", json({ a: "Hallo  Welt" }));
    await fx.commitAll("two spaces");

    const result = available(await history(fx));

    expect(values(result.revisions)).toEqual(["Hallo  Welt", "Hallo Welt"]);
    expect(result.revisions[0]?.diff.some((segment) => segment.kind !== "equal")).toBe(true);
  });

  it("returns an empty list for a key that never existed and a repository with no commits", async () => {
    const fx = await repo();
    await fx.write("locales/de.json", json({ a: "x" }));
    await fx.commitAll("one");
    const empty = await repo();

    expect(available(await history(fx, "missing"))).toMatchObject({
      revisions: [],
      truncated: false,
    });
    expect(available(await history(empty))).toMatchObject({ revisions: [], truncated: false });
  });

  it("returns the uncommitted value as the working tree when it differs from HEAD", async () => {
    const fx = await repo();
    await fx.write("locales/de.json", json({ a: "committed" }));
    await fx.commitAll("one");
    await fx.write("locales/de.json", json({ a: "committed and edited" }));

    const result = available(await history(fx));

    expect(result.workingTree).toEqual({
      value: "committed and edited",
      diff: [
        { kind: "equal", text: "committed" },
        { kind: "added", text: " and edited" },
      ],
    });
    expect(values(result.revisions)).toEqual(["committed"]);
  });

  it("returns no working tree row when the disk matches HEAD or the key is gone from disk", async () => {
    const fx = await repo();
    await fx.write("locales/de.json", json({ a: "x" }));
    await fx.commitAll("one");

    expect(available(await history(fx)).workingTree).toBeUndefined();

    await fx.write("locales/de.json", json({ b: "x" }));

    expect(available(await history(fx)).workingTree).toBeUndefined();
  });

  it("returns a new untracked file as the working tree against nothing, and in a repository with no commits", async () => {
    const fx = await repo();
    await fx.write("locales/de.json", json({ a: "new" }));

    const result = available(await history(fx));

    expect(result.revisions).toEqual([]);
    expect(result.workingTree).toEqual({ value: "new", diff: [{ kind: "added", text: "new" }] });
  });

  it("returns a key added to the working tree after commits as a row against nothing", async () => {
    const fx = await repo();
    await fx.write("locales/de.json", json({ b: "x" }));
    await fx.commitAll("one");
    await fx.write("locales/de.json", json({ a: "fresh", b: "x" }));

    const result = available(await history(fx));

    expect(result.workingTree).toEqual({
      value: "fresh",
      diff: [{ kind: "added", text: "fresh" }],
    });
  });

  it("works on a detached HEAD, listing the commits reachable from it", async () => {
    const fx = await repo();
    await commitValues(fx, ["one", "two", "three"]);
    await fx.git(["checkout", "-q", "--detach", "HEAD~1"]);

    const result = available(await history(fx));

    expect(values(result.revisions)).toEqual(["two", "one"]);
  });

  it("reads a monorepo subdirectory from its own path, not the root's file of the same name", async () => {
    const fx = await repo();
    const app = join(fx.root, "packages", "app");
    await fx.write("locales/de.json", json({ a: "root" }));
    await fx.write("locales/de.json", json({ a: "app one" }), app);
    await fx.commitAll("one");
    await fx.write("locales/de.json", json({ a: "app two" }), app);
    await fx.commitAll("two");
    await fx.write("locales/de.json", json({ a: "root two" }));
    await fx.commitAll("root only");

    const result = available(await history(fx, "a", { cwd: app }));

    expect(values(result.revisions)).toEqual(["app two", "app one"]);
  });

  it("lists a change a merge brought in on the merge commit and never walks the side branch", async () => {
    const fx = await repo();
    await fx.write("locales/de.json", json({ a: "base" }));
    await fx.commitAll("base");
    await fx.git(["checkout", "-q", "-b", "side"]);
    await fx.write("locales/de.json", json({ a: "from side" }));
    await fx.commitAll("side change");
    await fx.git(["checkout", "-q", "main"]);
    await fx.write("locales/other.json", json({ z: "z" }));
    await fx.commitAll("main work");
    await fx.git(["merge", "-q", "--no-ff", "-m", "merge side", "side"]);

    const result = available(await history(fx));

    expect(result.revisions.map((revision) => [revision.subject, revision.value])).toEqual([
      ["merge side", "from side"],
      ["base", "base"],
    ]);
  });

  it("does not follow a rename, even when the repository configures log.follow", async () => {
    const fx = await repo();
    await fx.write("locales/old.json", json({ a: "before the rename" }));
    await fx.commitAll("old name");
    await fx.git(["mv", "locales/old.json", "locales/de.json"]);
    await fx.commitAll("rename");
    await fx.git(["config", "log.follow", "true"]);

    const result = available(await history(fx));

    expect(result.revisions.map((revision) => revision.subject)).toEqual(["rename"]);
  });
});

describe("keyHistory limits and truncation", () => {
  it("examines the newest commits only and says the rest was not covered", async () => {
    const fx = await repo();
    await commitValues(fx, ["one", "two", "three", "four"]);

    const result = available(await history(fx, "a", { limit: 2 }));

    expect(values(result.revisions)).toEqual(["four", "three"]);
    expect(result.truncated).toBe(true);
    expect(result.revisions[1]?.diff).toEqual([
      { kind: "removed", text: "two" },
      { kind: "added", text: "three" },
    ]);
  });

  it("is not truncated when the limit exactly covers every commit", async () => {
    const fx = await repo();
    await commitValues(fx, ["one", "two"]);

    const result = available(await history(fx, "a", { limit: 2 }));

    expect(values(result.revisions)).toEqual(["two", "one"]);
    expect(result.truncated).toBe(false);
  });

  it("clamps the limit to between 1 and 200", async () => {
    const fx = await repo();
    await commitValues(fx, ["one", "two"]);

    expect(values(available(await history(fx, "a", { limit: 0 })).revisions)).toEqual(["two"]);
    expect(values(available(await history(fx, "a", { limit: 10_000 })).revisions)).toEqual([
      "two",
      "one",
    ]);
    expect(values(available(await history(fx, "a", { limit: Number.NaN })).revisions)).toEqual([
      "two",
      "one",
    ]);
  });

  it("marks a shallow clone truncated and lists only what it can compare", async () => {
    const fx = await repo();
    await commitValues(fx, ["one", "two", "three"]);
    const clone = join(fx.base, "clone");
    await fx.git(["clone", "-q", "--depth", "2", `file://${fx.root}`, clone], fx.base);

    const result = available(await history(fx, "a", { cwd: clone }));

    expect(result.truncated).toBe(true);
    expect(values(result.revisions)).toEqual(["three"]);
  });

  it("does not mark a full clone truncated", async () => {
    const fx = await repo();
    await commitValues(fx, ["one", "two"]);
    const clone = join(fx.base, "clone");
    await fx.git(["clone", "-q", `file://${fx.root}`, clone], fx.base);

    const result = available(await history(fx, "a", { cwd: clone }));

    expect(result.truncated).toBe(false);
    expect(values(result.revisions)).toEqual(["two", "one"]);
  });

  it("reads at most four files at a time", async () => {
    const fx = await repo();
    await commitValues(fx, ["1", "2", "3", "4", "5", "6", "7", "8", "9"]);
    let running = 0;
    let peak = 0;
    const execFile: GitExecFile = async (file, args, options) => {
      running += 1;
      peak = Math.max(peak, running);
      try {
        await new Promise((resolve) => setTimeout(resolve, 15));
        return await defaultGitExecFile(file, args, options);
      } finally {
        running -= 1;
      }
    };

    const result = available(await history(fx, "a", { execFile }));

    expect(result.revisions.length).toBe(9);
    expect(peak).toBeLessThanOrEqual(4);
    expect(peak).toBeGreaterThan(1);
  });
});

describe("keyHistory origin and sourceChanged", () => {
  async function withRecords(fx: GitFixture): Promise<void> {
    await fx.write("locales/en.json", json({ a: "Hello" }));
    await fx.write("locales/de.json", json({ a: "Hallo" }));
    await fx.write("verbatra.lock.json", lockOf({ a: await sourceHashOf(fx, "a") }));
    await fx.write(
      "verbatra.provenance.json",
      provenanceOf({ a: { origin: "machine", value: "Hallo" } }),
    );
    await fx.commitAll("translated");
  }

  it("reads origin from the provenance and sourceChanged false from a lock that matches", async () => {
    const fx = await repo();
    await withRecords(fx);

    const result = available(await history(fx));

    expect(result.revisions[0]).toMatchObject({ origin: "machine", sourceChanged: false });
  });

  it("says the source changed when the lock holds the hash of an older source", async () => {
    const fx = await repo();
    await withRecords(fx);
    await fx.write("locales/en.json", json({ a: "Hello there" }));
    await fx.commitAll("source edit");

    const result = available(await history(fx));

    expect(result.revisions[0]).toMatchObject({ sourceChanged: true });
  });

  it("answers unknown when the lock has no entry, no lock exists or the key left the source", async () => {
    const fx = await repo();
    await fx.write("locales/en.json", json({ a: "Hello" }));
    await fx.write("locales/de.json", json({ a: "Hallo" }));
    await fx.write("verbatra.lock.json", lockOf({ other: "abc" }));
    await fx.commitAll("no entry");
    await fx.write("locales/de.json", json({ a: "Hallo!" }));
    await fx.git(["rm", "-q", "-f", "verbatra.lock.json"]);
    await fx.commitAll("no lock");
    await fx.write("locales/en.json", json({ b: "Other" }));
    await fx.commitAll("key left the source");

    const result = available(await history(fx));

    expect(result.revisions.map((revision) => revision.sourceChanged)).toEqual([
      "unknown",
      "unknown",
    ]);
  });

  it("reports unrecorded, external and absent origins apart", async () => {
    const fx = await repo();
    await fx.write("locales/de.json", json({ a: "one" }));
    await fx.commitAll("no provenance file");
    await fx.write("locales/de.json", json({ a: "two" }));
    await fx.write(
      "verbatra.provenance.json",
      provenanceOf({ a: { origin: "human", value: "something else" } }),
    );
    await fx.commitAll("record describes another value");
    await fx.write("locales/de.json", json({ a: "three" }));
    await fx.write("verbatra.provenance.json", "{ not json");
    await fx.commitAll("broken provenance");
    await fx.write("locales/de.json", json({ a: "four" }));
    await fx.write("verbatra.provenance.json", JSON.stringify({ version: 99, locales: {} }));
    await fx.commitAll("newer provenance");
    await fx.write("locales/de.json", json({ a: "five" }));
    await fx.write(
      "verbatra.provenance.json",
      provenanceOf({ a: { origin: "bogus-origin", value: "five" } }),
    );
    await fx.commitAll("unknown origin string");

    const result = available(await history(fx));

    expect(result.revisions.map((revision) => revision.origin)).toEqual([
      "unknown",
      undefined,
      undefined,
      "external",
      "unrecorded",
    ]);
  });

  it("treats a key named like a prototype member as an ordinary key", async () => {
    const fx = await repo();
    await fx.write("locales/en.json", json({ constructor: "C" }));
    await fx.write("locales/de.json", json({ constructor: "K" }));
    await fx.write("verbatra.lock.json", lockOf({}));
    await fx.write("verbatra.provenance.json", provenanceOf({}));
    await fx.commitAll("one");

    const result = available(await history(fx, "constructor"));

    expect(result.revisions[0]).toMatchObject({
      value: "K",
      origin: "unrecorded",
      sourceChanged: "unknown",
    });
  });
});

describe("keyHistory refusals", () => {
  it("throws for a key that is empty or too long, and for a locale that is not a target", async () => {
    const fx = await repo();

    await expect(history(fx, "")).rejects.toMatchObject({ code: "UNKNOWN_KEY" });
    await expect(history(fx, "k".repeat(KEY_HISTORY_MAX_KEY_CHARS + 1))).rejects.toBeInstanceOf(
      SdkError,
    );
    await expect(
      keyHistory({ config: baseConfig(), cwd: fx.root, locale: "en", key: "a" }),
    ).rejects.toMatchObject({ code: "UNKNOWN_LOCALE" });
    await expect(
      keyHistory({ config: baseConfig(), cwd: fx.root, locale: "xx", key: "a" }),
    ).rejects.toMatchObject({ code: "UNKNOWN_LOCALE" });
  });

  it("accepts a key of exactly the maximum length", async () => {
    const fx = await repo();
    await fx.write("locales/de.json", json({ a: "x" }));
    await fx.commitAll("one");

    expect(available(await history(fx, "k".repeat(KEY_HISTORY_MAX_KEY_CHARS))).revisions).toEqual(
      [],
    );
  });

  it("returns custom-adapter for a custom format and outside-project for a pattern that leaves it", async () => {
    const fx = await repo();

    expect(
      await keyHistory({
        config: baseConfig({ format: "custom:mine" as never }),
        cwd: fx.root,
        locale: "de",
        key: "a",
      }),
    ).toEqual({ available: false, reason: "custom-adapter" });
    expect(
      await keyHistory({
        config: baseConfig({ files: { pattern: "../elsewhere/{locale}.json" } }),
        cwd: fx.root,
        locale: "de",
        key: "a",
      }),
    ).toEqual({ available: false, reason: "outside-project" });
  });

  it("returns the repository reason when git cannot be used", async () => {
    const fx = await repo();
    await fx.write("locales/de.json", json({ a: "x" }));
    await fx.commitAll("one");
    const owned = gitExecFileWith({
      GIT_TEST_ASSUME_DIFFERENT_OWNER: "1",
      GIT_CONFIG_NOSYSTEM: "1",
      HOME: fx.home,
    });
    const plain = await makeGitFixture({ init: false });
    fixtures.push(plain);

    expect(await history(fx, "a", { execFile: owned })).toEqual({
      available: false,
      reason: "dubious-ownership",
    });
    expect(await history(plain)).toEqual({ available: false, reason: "not-a-repository" });
  });

  it("lists the revisions and flags the working file when it does not parse, as during a merge conflict", async () => {
    const fx = await repo();
    await fx.write("locales/de.json", json({ a: "x" }));
    await fx.commitAll("one");
    await fx.write("locales/de.json", "<<<<<<< HEAD\n{ broken\n=======\n{}\n>>>>>>> side\n");

    const result = available(await history(fx));

    expect(result.revisions.map((revision) => revision.value)).toEqual(["x"]);
    expect(result.workingTreeUnreadable).toBe(true);
    expect(result.workingTree).toBeUndefined();
  });

  it("flags a working file above the size limit for its format", async () => {
    const fx = await repo();
    await fx.write("locales/en.json", json({ a: "A" }));
    await fx.write("locales/de.json", json({ a: "x" }));
    await fx.commitAll("one");
    await fx.write("locales/de.json", json({ a: "x", pad: "p".repeat(4_194_304) }));

    const result = available(await history(fx));

    expect(result.workingTreeUnreadable).toBe(true);
    expect(result.truncated).toBe(false);
  });

  it("reads a working file just under the size limit for its format", async () => {
    const fx = await repo();
    await fx.write("locales/de.json", json({ a: "x" }));
    await fx.commitAll("one");
    await fx.write("locales/de.json", json({ a: "y", pad: "p".repeat(4_194_000) }));

    const result = available(await history(fx));

    expect(result.workingTree?.value).toBe("y");
    expect(result.workingTreeUnreadable).toBeUndefined();
  });

  it("never passes the key to git", async () => {
    const fx = await repo();
    await fx.write("locales/de.json", json({ a: "x" }));
    await fx.commitAll("one");
    const key = "--output=/tmp/pwned";
    const seen: string[] = [];
    const execFile: GitExecFile = (file, args, options) => {
      seen.push(...args);
      return defaultGitExecFile(file, args, options);
    };

    await history(fx, key, { execFile });

    expect(seen.length).toBeGreaterThan(5);
    expect(seen.some((arg) => arg.includes(key) || arg.includes("pwned"))).toBe(false);
  });
});

describe("keyHistory value bound", () => {
  it("counts a value above the bound as unreadable instead of returning part of it", async () => {
    const fx = await repo();
    await fx.write("locales/de.json", json({ a: "short" }));
    await fx.commitAll("short");
    await fx.write("locales/de.json", json({ a: "x".repeat(KEY_HISTORY_MAX_VALUE_CHARS) }));
    await fx.commitAll("exactly at the bound");
    await fx.write("locales/de.json", json({ a: "x".repeat(KEY_HISTORY_MAX_VALUE_CHARS + 1) }));
    await fx.commitAll("too long");

    const result = available(await history(fx));

    expect(result.unreadableRevisions).toBe(1);
    expect(result.truncated).toBe(true);
    expect(result.revisions.map((revision) => revision.value.length)).toEqual([
      KEY_HISTORY_MAX_VALUE_CHARS,
      5,
    ]);
    expect(result.revisions[0]?.diff).toEqual([
      { kind: "removed", text: "short" },
      { kind: "added", text: "x".repeat(KEY_HISTORY_MAX_VALUE_CHARS) },
    ]);
  });

  it("returns no working tree row for a value above the bound", async () => {
    const fx = await repo();
    await fx.write("locales/de.json", json({ a: "short" }));
    await fx.commitAll("short");
    await fx.write("locales/de.json", json({ a: "x".repeat(KEY_HISTORY_MAX_VALUE_CHARS + 1) }));

    const result = available(await history(fx));

    expect(result.workingTree).toBeUndefined();
    expect(result.workingTreeUnreadable).toBe(true);
  });
});

describe("keyHistory redaction and parse limits", () => {
  const SECRET_A = `sk-proj-${"A1b2C3d4".repeat(6)}`;
  const SECRET_B = `sk-proj-${"Z9y8X7w6".repeat(6)}`;

  it("scrubs a key from the value and from both sides of the diff, so a split at the hyphen leaks nothing", async () => {
    const fx = await repo();
    await fx.write("locales/de.json", json({ a: `Schluessel ${SECRET_A} Ende` }));
    await fx.commitAll("one");
    await fx.write("locales/de.json", json({ a: `Schluessel ${SECRET_B} Ende` }));
    await fx.commitAll("two");
    await fx.write("locales/de.json", json({ a: `Schluessel ${SECRET_B} Ende!` }));

    const result = available(await history(fx));

    const text = JSON.stringify(result);
    expect(text).not.toContain("A1b2C3d4");
    expect(text).not.toContain("Z9y8X7w6");
    expect(result.revisions[0]).toMatchObject({
      value: "Schluessel [REDACTED] Ende",
      valueRedacted: true,
    });
    expect(result.workingTree).toMatchObject({ valueRedacted: true });
    expect(result.workingTree?.value).toBe("Schluessel [REDACTED] Ende!");
  });

  it("scrubs the value of a configured provider key variable, hyphenated or not", async () => {
    const key = `proj-key-${"Q".repeat(20)}`;
    vi.stubEnv("OPENAI_API_KEY", key);
    const fx = await repo();
    await fx.write("locales/de.json", json({ a: `env ${key}` }));
    await fx.commitAll("one");

    const result = available(await history(fx));

    expect(JSON.stringify(result)).not.toContain("QQQQ");
    expect(result.revisions[0]).toMatchObject({ valueRedacted: true });
    vi.unstubAllEnvs();
  });

  it("leaves a value the scrubber does not change without the flag", async () => {
    const fx = await repo();
    await fx.write("locales/de.json", json({ a: "plain" }));
    await fx.commitAll("one");

    const result = available(await history(fx));

    expect(result.revisions[0]).not.toHaveProperty("valueRedacted");
  });

  it("skips a yaml file and an xml file above 512 KiB without parsing them, and says so", async () => {
    const yaml = await repo();
    const config = baseConfig({ format: "yaml", files: { pattern: "locales/{locale}.yaml" } });
    await yaml.write("locales/en.yaml", "a: A\n");
    await yaml.write("locales/de.yaml", "a: one\n");
    await yaml.commitAll("small");
    await yaml.write("locales/de.yaml", `a: two\npad: "${"q".repeat(524_300)}"\n`);
    await yaml.commitAll("big");
    await yaml.write("locales/de.yaml", "a: three\n");
    await yaml.commitAll("small again");
    const xml = await repo();
    const xmlConfig = baseConfig({
      format: "android-xml",
      files: { pattern: "values-{locale}/strings.xml" },
    });
    const resources = (value: string, pad = ""): string =>
      `<?xml version="1.0" encoding="utf-8"?>\n<resources><string name="a">${value}</string>${pad}</resources>\n`;
    await xml.write("values-de/strings.xml", resources("one"));
    await xml.commitAll("small");
    await xml.write(
      "values-de/strings.xml",
      resources("two", `<string name="p">${"q".repeat(524_300)}</string>`),
    );
    await xml.commitAll("big");
    await xml.write("values-de/strings.xml", resources("three"));
    await xml.commitAll("small again");

    const yamlResult = available(
      await keyHistory({ config, cwd: yaml.root, locale: "de", key: "a" }),
    );
    const xmlResult = available(
      await keyHistory({ config: xmlConfig, cwd: xml.root, locale: "de", key: "a" }),
    );

    expect(yamlResult.unreadableRevisions).toBe(1);
    expect(yamlResult.truncated).toBe(true);
    expect(yamlResult.revisions.map((revision) => revision.value)).toEqual(["one"]);
    expect(xmlResult.unreadableRevisions).toBe(1);
    expect(xmlResult.truncated).toBe(true);
    expect(xmlResult.revisions.map((revision) => revision.value)).toEqual(["one"]);
  });

  it("reads a yaml file just under 512 KiB and a json file of 1.5 MiB in full", async () => {
    const yaml = await repo();
    const config = baseConfig({ format: "yaml", files: { pattern: "locales/{locale}.yaml" } });
    await yaml.write("locales/en.yaml", "a: A\n");
    for (const value of ["one", "two"]) {
      await yaml.write("locales/de.yaml", `a: ${value}\npad: "${"q".repeat(524_000)}"\n`);
      await yaml.commitAll(value);
    }
    const big = await repo();
    await big.write("locales/en.json", json({ a: "A" }));
    for (const value of ["one", "two"]) {
      await big.write("locales/de.json", json({ a: value, pad: "p".repeat(1_500_000) }));
      await big.commitAll(value);
    }

    const yamlResult = available(
      await keyHistory({ config, cwd: yaml.root, locale: "de", key: "a" }),
    );
    const bigResult = available(await history(big));

    expect(yamlResult.revisions.map((revision) => revision.value)).toEqual(["two", "one"]);
    expect(yamlResult).toMatchObject({ truncated: false, unreadableRevisions: 0 });
    expect(bigResult.revisions.map((revision) => revision.value)).toEqual(["two", "one"]);
    expect(bigResult).toMatchObject({ truncated: false, unreadableRevisions: 0 });
  });

  it("skips a json file above 4 MiB and says so", async () => {
    const fx = await repo();
    await fx.write("locales/en.json", json({ a: "A" }));
    await fx.write("locales/de.json", json({ a: "one" }));
    await fx.commitAll("one");
    await fx.write("locales/de.json", json({ a: "two", pad: "p".repeat(4_194_304) }));
    await fx.commitAll("big");
    await fx.write("locales/de.json", json({ a: "three" }));
    await fx.commitAll("three");

    const result = available(await history(fx));

    expect(result.unreadableRevisions).toBe(1);
    expect(result.truncated).toBe(true);
    expect(result.revisions.map((revision) => revision.value)).toEqual(["one"]);
  });

  it("stops examining older commits once the slow class byte budget of a call is spent, and says so", async () => {
    const fx = await repo();
    const config = baseConfig({ format: "yaml", files: { pattern: "locales/{locale}.yaml" } });
    await fx.write("locales/en.yaml", "a: A\n");
    for (let index = 0; index < 36; index += 1) {
      await fx.write("locales/de.yaml", `a: v${index}\npad: "${"q".repeat(524_000)}"\n`);
      await fx.commitAll(`v${index}`);
    }

    const result = available(
      await keyHistory({ config, cwd: fx.root, locale: "de", key: "a", limit: 200 }),
    );

    expect(result.revisions.map((revision) => revision.value)).toEqual(
      Array.from({ length: 31 }, (_, index) => `v${35 - index}`),
    );
    expect(result.truncated).toBe(true);
    expect(result.unreadableRevisions).toBe(0);
  });
});

describe("keyHistory unusual projects", () => {
  it("lists a key again when its whole file was deleted and recreated with the same value", async () => {
    const fx = await repo();
    await fx.write("locales/en.json", json({ a: "A" }));
    await fx.write("locales/de.json", json({ a: "same" }));
    await fx.commitAll("created");
    await fx.git(["rm", "-q", "locales/de.json"]);
    await fx.commitAll("deleted");
    await fx.write("locales/de.json", json({ a: "same" }));
    await fx.commitAll("recreated");

    const result = available(await history(fx));

    expect(result.revisions.map((revision) => revision.subject)).toEqual(["recreated", "created"]);
    expect(result.truncated).toBe(false);
  });

  it("answers sourceChanged unknown when the committed lock-file is not valid JSON", async () => {
    const fx = await repo();
    await fx.write("locales/en.json", json({ a: "A" }));
    await fx.write("locales/de.json", json({ a: "x" }));
    await fx.write("verbatra.lock.json", "{ not json");
    await fx.commitAll("one");

    const result = available(await history(fx));

    expect(result.revisions[0]).toMatchObject({ sourceChanged: "unknown" });
  });

  it("answers the git reason when the log itself fails", async () => {
    const fx = await repo();
    await fx.write("locales/de.json", json({ a: "x" }));
    await fx.commitAll("one");
    const execFile: GitExecFile = async (file, args, options) => {
      if (args.includes("log")) {
        throw Object.assign(new Error("slow"), { killed: true, signal: "SIGKILL" });
      }
      return defaultGitExecFile(file, args, options);
    };

    expect(await history(fx, "a", { execFile })).toEqual({ available: false, reason: "timeout" });
  });

  it.each([
    "-x{locale}.json",
    "l o c/{locale} file.json",
    "locales/{locale}/--help.json",
    "ünï/{locale}.json",
  ])("finds the watched file for the pattern %s and never reports it missing", async (pattern) => {
    const fx = await repo();
    const config = baseConfig({ files: { pattern } });
    const path = pattern.replace("{locale}", "de");
    await fx.write(path, json({ a: "x" }));
    await fx.commitAll("one");

    const result = await keyHistory({ config, cwd: fx.root, locale: "de", key: "a" });

    expect(result).toMatchObject({ available: true, revisions: [{ value: "x" }] });
  });
});

describe("keyHistory log lines", () => {
  it("counts a commit whose date does not parse as unreadable and never drops it silently", async () => {
    const fx = await repo();
    await fx.write("locales/de.json", json({ a: "one" }));
    await fx.commitAll("one");
    await fx.write("locales/de.json", json({ a: "two" }));
    await fx.commitAll("two");
    const real = (await fx.git(["log", "--format=%H"])).trim().split("\n");
    const execFile: GitExecFile = async (file, args, options) => {
      const result = await defaultGitExecFile(file, args, options);
      if (!args.includes("log")) {
        return result;
      }
      return {
        ...result,
        stdout: result.stdout.replace(/^(\w{40})\0[^\0]+\0/gm, "$1\0not-a-date\0"),
        stderr: result.stderr,
      };
    };

    const result = available(await history(fx, "a", { execFile }));

    expect(real).toHaveLength(2);
    expect(result.unreadableRevisions).toBe(2);
    expect(result.truncated).toBe(true);
    expect(result.revisions).toEqual([]);
  });
});
