import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { baseConfig, type GitFixture, makeGitFixture } from "../test-support.js";
import { keyHistory } from "./key-history.js";
import { localeHistory } from "./locale-history.js";

const ENV_KEY = `lt-${"Q7x9".repeat(15)}`;
const PATTERN_KEY = `sk-${"a1B2c3D4".repeat(5)}`;
const OFFSETS = [0, 437, 438, 460, 470, 480, 495, 499, 500];

const fixtures: GitFixture[] = [];
let previous: string | undefined;

beforeEach(() => {
  previous = process.env.LIBRETRANSLATE_API_KEY;
  process.env.LIBRETRANSLATE_API_KEY = ENV_KEY;
});

afterEach(async () => {
  if (previous === undefined) {
    delete process.env.LIBRETRANSLATE_API_KEY;
  } else {
    process.env.LIBRETRANSLATE_API_KEY = previous;
  }
  await Promise.all(fixtures.splice(0).map((created) => created.cleanup()));
});

async function leakyRepo(): Promise<GitFixture> {
  const fx = await makeGitFixture();
  fixtures.push(fx);
  let counter = 0;
  for (const key of [ENV_KEY, PATTERN_KEY]) {
    for (const offset of OFFSETS) {
      counter += 1;
      await fx.write("locales/de.json", `${JSON.stringify({ a: `value ${counter}` })}\n`);
      await fx.git(["add", "-A"]);
      await fx.git([
        "-c",
        `user.name=${"n".repeat(offset % 190)} ${key}`,
        "commit",
        "-q",
        "-m",
        `${"s".repeat(offset)} ${key} tail`,
      ]);
    }
  }
  return fx;
}

function fragments(text: string): boolean {
  return /lt-Q7x9|sk-a1B2|Q7x9Q7x9|a1B2c3D4a1B2/.test(text);
}

describe("commit subjects and author names", () => {
  it("never carry any part of a key, whether it sits before, across or after the cut, in keyHistory", async () => {
    const fx = await leakyRepo();

    const result = await keyHistory(
      { config: baseConfig(), cwd: fx.root, locale: "de", key: "a", limit: 200 },
      {},
    );

    if (!result.available) {
      throw new Error(`unavailable: ${result.reason}`);
    }
    expect(result.revisions.length).toBe(OFFSETS.length * 2);
    for (const revision of result.revisions) {
      expect(fragments(revision.subject)).toBe(false);
      expect(fragments(revision.author)).toBe(false);
      expect(revision.subject.length).toBeLessThanOrEqual(500);
      expect(revision.author.length).toBeLessThanOrEqual(200);
    }
  });

  it("never carry any part of a key in localeHistory either, and are cut to the same lengths", async () => {
    const fx = await leakyRepo();

    const result = await localeHistory({ config: baseConfig(), cwd: fx.root, limit: 200 }, {});

    if (!result.available) {
      throw new Error(`unavailable: ${result.reason}`);
    }
    expect(result.commits.length).toBe(OFFSETS.length * 2);
    for (const commit of result.commits) {
      expect(fragments(commit.subject)).toBe(false);
      expect(fragments(commit.author)).toBe(false);
      expect(commit.subject.length).toBeLessThanOrEqual(500);
      expect(commit.author.length).toBeLessThanOrEqual(200);
    }
  });

  it("keeps a subject of 200,005 characters to 500 in localeHistory", async () => {
    const fx = await makeGitFixture();
    fixtures.push(fx);
    await fx.write("locales/de.json", '{"a":"x"}\n');
    await fx.commitAll("z".repeat(200_005));

    const result = await localeHistory({ config: baseConfig(), cwd: fx.root }, {});

    if (!result.available) {
      throw new Error(`unavailable: ${result.reason}`);
    }
    expect(result.commits[0]?.subject).toHaveLength(500);
  });
});
