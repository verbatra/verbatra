import { cp, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { VerbatraConfig } from "../config/schema.js";
import { PROVENANCE_FILE_NAME } from "../lock/provenance-file.js";
import { runStatusFilePath } from "../run-status/run-status-file.js";
import type { RunStatusLocale } from "../run-status/types.js";
import {
  baseConfig,
  makeStubProvider,
  makeTempDir,
  readJsonFile,
  writeJsonFile,
} from "../test-support.js";
import { editEntry } from "./edit-entry.js";
import { approveEntry, rejectEntry } from "./review-decision.js";
import { reviewQueue } from "./review-queue.js";
import { translate } from "./translate-project.js";

const cfg = (overrides: Partial<VerbatraConfig> = {}): VerbatraConfig =>
  baseConfig({ targetLocales: ["de"], ...overrides });

const SOURCE = { greeting: "Hello", farewell: "Bye", title: "Title" };

const MACHINE = {
  origin: "machine",
  provider: "anthropic",
  model: "test-model",
  reviewState: "unreviewed",
} as const;

async function writeStatus(dir: string, locales: readonly RunStatusLocale[]): Promise<void> {
  const path = runStatusFilePath(dir);
  await mkdir(join(dir, ".verbatra-local"), { recursive: true });
  await writeFile(
    path,
    JSON.stringify({ version: 1, generatedAt: "2026-09-23T10:00:00.000Z", locales }),
    "utf8",
  );
}

function flagged(...keys: string[]): RunStatusLocale {
  return {
    locale: "de",
    status: "succeeded",
    needsReview: keys.map((key) => ({ key, reasons: ["EQUALS_SOURCE"] })),
  };
}

async function translatedProject(config: VerbatraConfig = cfg()): Promise<string> {
  const dir = await makeTempDir();
  await mkdir(join(dir, "locales"));
  await writeJsonFile(join(dir, "locales", "en.json"), SOURCE);
  await translate(
    { config, cwd: dir },
    { createProvider: (provider) => makeStubProvider({ id: provider.id }).provider },
  );
  return dir;
}

async function translationOf(dir: string, key: string): Promise<string> {
  const values = (await readJsonFile(join(dir, "locales", "de.json"))) as Record<string, string>;
  return values[key] ?? "";
}

async function queuedKeys(dir: string, config: VerbatraConfig = cfg()): Promise<string[]> {
  const queue = await reviewQueue({ config, cwd: dir });
  return queue.available ? queue.locales.flatMap((l) => l.needsReview.map((e) => e.key)) : [];
}

async function approve(dir: string, key: string): Promise<void> {
  await approveEntry({
    config: cfg(),
    cwd: dir,
    locale: "de",
    key,
    expectedValue: await translationOf(dir, key),
  });
}

describe("reviewQueue", () => {
  it("lists every unreviewed machine value from the committed files, in source order", async () => {
    const dir = await translatedProject();

    expect(await reviewQueue({ config: cfg(), cwd: dir })).toEqual({
      available: true,
      lastRunAt: expect.any(String),
      locales: [
        {
          locale: "de",
          needsReview: [
            { key: "greeting", reasons: [], provenance: MACHINE },
            { key: "farewell", reasons: [], provenance: MACHINE },
            { key: "title", reasons: [], provenance: MACHINE },
          ],
        },
      ],
    });
  });

  it("is the same queue in a fresh copy of the project, without the local run status", async () => {
    const dir = await translatedProject();
    await writeStatus(dir, [flagged("greeting")]);
    await approve(dir, "farewell");
    const copy = await makeTempDir();
    await cp(dir, copy, { recursive: true, filter: (path) => !path.includes(".verbatra-local") });

    expect(await queuedKeys(copy)).toEqual(await queuedKeys(dir));
    expect(await queuedKeys(copy)).toEqual(["greeting", "title"]);
  });

  it("adds the last run's flags, fuzzy evidence, and time to the entries it flagged", async () => {
    const dir = await translatedProject();
    await writeStatus(dir, [
      {
        ...flagged("greeting", "title"),
        fuzzyHits: [
          { key: "greeting", previousSource: "Hi", similarity: 0.9 },
          { key: "title", previousSource: "Titles", similarity: 0.9 },
        ],
      },
    ]);
    await approve(dir, "title");

    const queue = await reviewQueue({ config: cfg(), cwd: dir });

    expect(queue).toEqual({
      available: true,
      lastRunAt: "2026-09-23T10:00:00.000Z",
      locales: [
        {
          locale: "de",
          needsReview: [
            { key: "greeting", reasons: ["EQUALS_SOURCE"], provenance: MACHINE },
            { key: "farewell", reasons: [], provenance: MACHINE },
          ],
          fuzzyHits: [{ key: "greeting", previousSource: "Hi", similarity: 0.9 }],
        },
      ],
    });
  });

  it("drops a value once it is approved, rejected, or rewritten by a person", async () => {
    const dir = await translatedProject();
    const base = { config: cfg(), cwd: dir, locale: "de" };
    await approve(dir, "greeting");
    await rejectEntry({
      ...base,
      key: "farewell",
      expectedValue: await translationOf(dir, "farewell"),
    });

    expect(await queuedKeys(dir)).toEqual(["title"]);

    await editEntry({ ...base, key: "title", value: "Titel" });

    expect(await queuedKeys(dir)).toEqual([]);
  });

  it("keeps a value an agent rewrote, and puts an approved value back once an agent rewrites it", async () => {
    const dir = await translatedProject();
    await approve(dir, "title");

    await editEntry({
      config: cfg(),
      cwd: dir,
      locale: "de",
      key: "title",
      value: "Titel",
      actor: "agent",
    });

    expect(await queuedKeys(dir)).toEqual(["greeting", "farewell", "title"]);
  });

  it("leaves out a value edited by hand, which reads as external", async () => {
    const dir = await translatedProject();
    await writeJsonFile(join(dir, "locales", "de.json"), {
      greeting: "Hallo",
      farewell: await translationOf(dir, "farewell"),
      title: await translationOf(dir, "title"),
    });

    expect(await queuedKeys(dir)).toEqual(["farewell", "title"]);
  });

  it("brings an approval back when the source it was given against changed", async () => {
    const dir = await translatedProject();
    await approve(dir, "greeting");
    const lock = (await readJsonFile(join(dir, "verbatra.lock.json"))) as {
      locales: { de: Record<string, string> };
    };
    await writeJsonFile(join(dir, "verbatra.lock.json"), {
      version: 1,
      locales: { de: { ...lock.locales.de, greeting: "another-source-hash" } },
    });

    expect(await queuedKeys(dir)).toEqual(["greeting", "farewell", "title"]);
  });

  it("lists the approved values too when asked", async () => {
    const dir = await translatedProject();
    await approve(dir, "farewell");

    const queue = await reviewQueue({ config: cfg(), cwd: dir, includeApproved: true });

    expect(queue.available && queue.locales[0]?.approved).toEqual([
      { key: "farewell", reasons: [], provenance: { ...MACHINE, reviewState: "approved" } },
    ]);
  });

  it("narrows the queue to the requested locales", async () => {
    const config = cfg({ targetLocales: ["de", "fr"] });
    const dir = await translatedProject(config);

    const queue = await reviewQueue({ config, cwd: dir, locales: ["fr"] });

    expect(queue.available && queue.locales.map((locale) => locale.locale)).toEqual(["fr"]);
  });

  it("is empty when no provenance file exists", async () => {
    const dir = await makeTempDir();
    await mkdir(join(dir, "locales"));
    await writeJsonFile(join(dir, "locales", "en.json"), SOURCE);
    await writeJsonFile(join(dir, "locales", "de.json"), { greeting: "Hallo" });

    expect(await reviewQueue({ config: cfg(), cwd: dir })).toEqual({
      available: true,
      locales: [{ locale: "de", needsReview: [] }],
    });
  });

  it("reports available: false when the provenance file is corrupt or from a newer verbatra", async () => {
    const dir = await translatedProject();
    await writeFile(join(dir, PROVENANCE_FILE_NAME), "{ not json", "utf8");

    expect(await reviewQueue({ config: cfg(), cwd: dir })).toEqual({
      available: false,
      reason: "provenance-unreadable",
    });

    await writeJsonFile(join(dir, PROVENANCE_FILE_NAME), { version: 99, locales: {} });

    expect(await reviewQueue({ config: cfg(), cwd: dir })).toEqual({
      available: false,
      reason: "provenance-unreadable",
    });
  });

  it("fails like check when the lock file is corrupt", async () => {
    const dir = await translatedProject();
    await writeFile(join(dir, "verbatra.lock.json"), "{ not json", "utf8");

    await expect(reviewQueue({ config: cfg(), cwd: dir })).rejects.toMatchObject({
      code: "LOCK_FILE_INVALID",
    });
  });
});
