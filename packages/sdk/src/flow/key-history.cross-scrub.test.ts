import { join } from "node:path";
import { contentHash } from "@verbatra/core";
import { afterEach, describe, expect, it } from "vitest";
import { selectAdapter } from "../selection/select-adapter.js";
import { baseConfig, type GitFixture, makeGitFixture } from "../test-support.js";
import { keyHistory } from "./key-history.js";

const UUID = "123e4567-e89b-12d3-a456-426614174000";
const fixtures: GitFixture[] = [];

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((created) => created.cleanup()));
});

function json(value: string): string {
  return `${JSON.stringify({ a: value }, null, 2)}\n`;
}

async function repoWith(
  values: readonly { value: string; subject?: string; author?: string }[],
  working?: string,
  baseline = false,
): Promise<GitFixture> {
  const fx = await makeGitFixture();
  fixtures.push(fx);
  if (baseline) {
    await fx.write("locales/en.json", json("hello"));
    const read = await selectAdapter("i18next-json").read(join(fx.root, "locales/en.json"), "en");
    const hash = contentHash(read.resource.entries.get("a") as never);
    await fx.write(
      "verbatra.lock.json",
      `${JSON.stringify({ version: 1, locales: { de: { a: hash } } }, null, 2)}\n`,
    );
  }
  for (const step of values) {
    await fx.write("locales/de.json", json(step.value));
    await fx.git(["add", "-A"]);
    await fx.git([
      "-c",
      `user.name=${step.author ?? "Test User"}`,
      "commit",
      "-q",
      "-m",
      step.subject ?? "change",
    ]);
  }
  if (working !== undefined) {
    await fx.write("locales/de.json", json(working));
  }
  return fx;
}

function expectEverythingHidden(result: Awaited<ReturnType<typeof run>>): void {
  expect(result.revisions.length).toBeGreaterThan(0);
  for (const revision of result.revisions) {
    expect(revision.value).toBe("[REDACTED]");
    expect(revision.valueRedacted).toBe(true);
    expect(revision.subject === "" || revision.subject === "[REDACTED]").toBe(true);
    expect(revision.author === "" || revision.author === "[REDACTED]").toBe(true);
    for (const segment of revision.diff) {
      expect(segment.text).toBe("[REDACTED]");
    }
  }
  if (result.workingTree !== undefined) {
    expect(result.workingTree.value).toBe("[REDACTED]");
    expect(result.workingTree.valueRedacted).toBe(true);
  }
}

async function run(fx: GitFixture) {
  const result = await keyHistory(
    { config: baseConfig(), cwd: fx.root, locale: "de", key: "a" },
    {},
  );
  if (!result.available) {
    throw new Error(`unavailable: ${result.reason}`);
  }
  return result;
}

function everything(result: Awaited<ReturnType<typeof run>>): string {
  return JSON.stringify(result);
}

describe("a key that only some revisions give away", () => {
  it("scrubs a bare uuid in an older revision when a newer one names it with key context", async () => {
    const fx = await repoWith([
      { value: `token ${UUID} here` },
      { value: `token api_key=${UUID} here` },
    ]);

    const result = await run(fx);

    expect(everything(result)).not.toContain(UUID);
    expect(result.revisions.map((revision) => revision.valueRedacted)).toEqual([true, true]);
  });

  it("scrubs a bare uuid in a newer revision when an older one names it with key context", async () => {
    const fx = await repoWith([
      { value: `token api_key=${UUID} here` },
      { value: `token ${UUID} here` },
    ]);

    const result = await run(fx);

    expect(everything(result)).not.toContain(UUID);
    expect(result.revisions.map((revision) => revision.valueRedacted)).toEqual([true, true]);
  });

  it("scrubs the removed diff segment too, not only the stored value", async () => {
    const fx = await repoWith([
      { value: `${UUID} stays` },
      { value: "api_key=" + UUID + " stays" },
      { value: "gone stays" },
    ]);

    const result = await run(fx);

    expect(everything(result)).not.toContain(UUID);
    expect(result.revisions[0]?.diff.some((segment) => segment.kind === "removed")).toBe(true);
  });

  it("scrubs a working tree value, a subject and an author that carry the bare uuid", async () => {
    const fx = await repoWith(
      [
        { value: `token api_key=${UUID} here` },
        { value: "later", subject: `uses ${UUID} directly`, author: `Dev ${UUID}` },
      ],
      `again ${UUID}`,
    );

    const result = await run(fx);

    expect(everything(result)).not.toContain(UUID);
    expect(result.workingTree?.valueRedacted).toBe(true);
    expect(result.revisions[0]?.subject).toContain("[REDACTED]");
    expect(result.revisions[0]?.author).toContain("[REDACTED]");
  });

  it("scrubs a bare uuid in the subject that a value names with key context", async () => {
    const fx = await repoWith([
      { value: "plain", subject: `leaked ${UUID}` },
      { value: `x api_key=${UUID}` },
    ]);

    const result = await run(fx);

    expect(everything(result)).not.toContain(UUID);
  });

  it("leaves unrelated values alone and does not flag them", async () => {
    const fx = await repoWith([
      { value: "one" },
      { value: `x api_key=${UUID}` },
      { value: "three" },
    ]);

    const result = await run(fx);

    expect(result.revisions.map((revision) => revision.valueRedacted)).toEqual([
      undefined,
      true,
      undefined,
    ]);
  });

  it("says the answer is incomplete when more keys turn up than it can cross-scrub", async () => {
    const values = Array.from({ length: 150 }, (_, index) => ({
      value: `k${index} api_key=${String(index).padStart(8, "0")}-e89b-12d3-a456-426614174000 api_key=${String(index).padStart(8, "a")}-e89b-12d3-a456-426614174000`,
    }));
    const fx = await repoWith(values, undefined, true);

    const result = await keyHistory(
      { config: baseConfig(), cwd: fx.root, locale: "de", key: "a", limit: 200 },
      {},
    );

    expect(result.available && result.truncated).toBe(true);
    expect(result.available && result.truncatedBy).toContain("scrub-cap");
    if (!result.available) {
      throw new Error("unavailable");
    }
    expectEverythingHidden(result);
  });

  it("hides everything when one literal is longer than the cross-scrub keeps, in a subject, author or value", async () => {
    const long = `sk-${"a1B2c3D4".repeat(600)}`;
    const fx = await repoWith(
      [
        { value: "one", subject: `leaked ${long}` },
        { value: `two api_key=${UUID}`, author: `Dev ${long}` },
      ],
      `three ${UUID}`,
    );

    const result = await run(fx);

    expect(result.truncatedBy).toContain("scrub-cap");
    expectEverythingHidden(result);
  });

  it("flags even an empty value, or one that already reads like the marker, as hidden on overflow", async () => {
    const long = `sk-${"a1B2c3D4".repeat(600)}`;
    const fx = await repoWith([
      { value: "[REDACTED]", subject: `leaked ${long}` },
      { value: "" },
      { value: "plain" },
    ]);

    const result = await run(fx);

    expect(result.revisions.map((revision) => revision.valueRedacted)).toEqual([true, true, true]);
  });

  it("keeps a real key under the length limit out of the overflow", async () => {
    const real = `sk-proj-${"A1b2C3d4".repeat(20)}`;
    const fx = await repoWith([{ value: `k ${real}` }, { value: `x${real}` }], undefined, true);

    const result = await keyHistory(
      { config: baseConfig(), cwd: fx.root, locale: "de", key: "a" },
      {},
    );

    expect(result.available && result.truncatedBy).toEqual([]);
    expect(JSON.stringify(result)).not.toContain("A1b2C3d4");
  });

  it("does not call the answer incomplete while every key fits the cross-scrub", async () => {
    const values = Array.from({ length: 100 }, (_, index) => ({
      value: `k${index} api_key=${String(index).padStart(8, "0")}-e89b-12d3-a456-426614174000 api_key=${String(index).padStart(8, "a")}-e89b-12d3-a456-426614174000`,
    }));
    const fx = await repoWith(values, undefined, true);

    const result = await keyHistory(
      { config: baseConfig(), cwd: fx.root, locale: "de", key: "a", limit: 200 },
      {},
    );

    expect(result.available && result.truncated).toBe(false);
  });

  it("learns the key from a commit subject that names it with key context", async () => {
    const fx = await repoWith([{ value: `token ${UUID} here`, subject: `rotate api_key=${UUID}` }]);

    const result = await run(fx);

    expect(everything(result)).not.toContain(UUID);
    expect(result.revisions[0]?.valueRedacted).toBe(true);
  });

  it("learns the key from an author name that names it with key context", async () => {
    const fx = await repoWith([{ value: `token ${UUID} here`, author: `dev api_key=${UUID}` }]);

    const result = await run(fx);

    expect(everything(result)).not.toContain(UUID);
    expect(result.revisions[0]?.valueRedacted).toBe(true);
  });

  it("learns the key from the working tree value", async () => {
    const fx = await repoWith([{ value: `token ${UUID} here` }], `token api_key=${UUID} here`);

    const result = await run(fx);

    expect(everything(result)).not.toContain(UUID);
    expect(result.revisions[0]?.valueRedacted).toBe(true);
  });

  it("learns the key from the older value the oldest examined revision is compared with", async () => {
    const fx = await repoWith([
      { value: `token api_key=${UUID} here` },
      { value: `token ${UUID} here` },
    ]);

    const result = await keyHistory(
      { config: baseConfig(), cwd: fx.root, locale: "de", key: "a", limit: 1 },
      {},
    );

    expect(JSON.stringify(result)).not.toContain(UUID);
    expect(result.available && result.revisions[0]?.valueRedacted).toBe(true);
  });
});
