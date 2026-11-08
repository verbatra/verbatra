import { afterEach, describe, expect, it } from "vitest";
import { baseConfig, type GitFixture, makeGitFixture } from "../test-support.js";
import { KEY_HISTORY_TRUNCATION_REASONS, keyHistory } from "./key-history.js";

const fixtures: GitFixture[] = [];

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((created) => created.cleanup()));
});

async function commits(values: readonly string[]): Promise<GitFixture> {
  const fx = await makeGitFixture();
  fixtures.push(fx);
  await fx.write("locales/en.json", `${JSON.stringify({ a: "A" })}\n`);
  for (const value of values) {
    await fx.write("locales/de.json", `${JSON.stringify({ a: value })}\n`);
    await fx.commitAll(value);
  }
  return fx;
}

describe("keyHistory truncatedBy", () => {
  it("lists the reasons in the order of the exported list", () => {
    expect([...KEY_HISTORY_TRUNCATION_REASONS]).toEqual([
      "commit-limit",
      "shallow-clone",
      "unreadable-revision",
      "file-too-large",
      "byte-budget",
      "deadline",
      "source-unreadable",
      "records-unreadable",
      "scrub-cap",
    ]);
  });

  it("names only the commit limit when the limit is all that cut the list", async () => {
    const fx = await commits(["one", "two", "three"]);

    const result = await keyHistory(
      { config: baseConfig(), cwd: fx.root, locale: "de", key: "a", limit: 2 },
      {},
    );

    expect(result.available && result.truncatedBy).toEqual(["commit-limit"]);
    expect(result.available && result.truncated).toBe(true);
  });

  it("names nothing for a complete history", async () => {
    const fx = await commits(["one", "two"]);

    const result = await keyHistory(
      { config: baseConfig(), cwd: fx.root, locale: "de", key: "a" },
      {},
    );

    expect(result.available && result.truncatedBy).toEqual([]);
    expect(result.available && result.truncated).toBe(false);
  });

  it("does not name the commit limit for a shallow clone that is not cut by the limit", async () => {
    const fx = await commits(["one", "two", "three"]);
    const clone = `${fx.base}/clone`;
    await fx.git(["clone", "-q", "--depth", "2", `file://${fx.root}`, clone], fx.base);

    const result = await keyHistory(
      { config: baseConfig(), cwd: clone, locale: "de", key: "a" },
      {},
    );

    expect(result.available && result.truncatedBy).toEqual(["shallow-clone"]);
  });

  it("names the commit limit and a shallow clone together when both apply", async () => {
    const fx = await commits(["one", "two", "three", "four"]);
    const clone = `${fx.base}/clone`;
    await fx.git(["clone", "-q", "--depth", "3", `file://${fx.root}`, clone], fx.base);

    const result = await keyHistory(
      { config: baseConfig(), cwd: clone, locale: "de", key: "a", limit: 1 },
      {},
    );

    expect(result.available && result.truncatedBy).toContain("commit-limit");
  });

  it("names an unreadable commit file", async () => {
    const fx = await commits(["one"]);
    await fx.write("locales/de.json", "<<<<<<< HEAD\n{ broken\n");
    await fx.commitAll("conflict");
    await fx.write("locales/de.json", `${JSON.stringify({ a: "two" })}\n`);
    await fx.commitAll("fixed");

    const result = await keyHistory(
      { config: baseConfig(), cwd: fx.root, locale: "de", key: "a" },
      {},
    );

    expect(result.available && result.truncatedBy).toEqual(["unreadable-revision"]);
  });
});
