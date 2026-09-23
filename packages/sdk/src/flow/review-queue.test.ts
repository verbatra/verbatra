import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { VerbatraConfig } from "../config/schema.js";
import { defaultFs, type SdkFs } from "../fs.js";
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
  await translate({ config, cwd: dir }, { createProvider: () => makeStubProvider().provider });
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

describe("reviewQueue", () => {
  it("reports available: false when no run status exists", async () => {
    const dir = await makeTempDir();

    expect(await reviewQueue({ config: cfg(), cwd: dir })).toEqual({ available: false });
  });

  it("keeps undecided flags with the provenance of their current value", async () => {
    const dir = await translatedProject();
    await writeStatus(dir, [flagged("greeting")]);

    const queue = await reviewQueue({ config: cfg(), cwd: dir });

    expect(queue).toEqual({
      available: true,
      version: 1,
      generatedAt: "2026-09-23T10:00:00.000Z",
      locales: [
        {
          locale: "de",
          status: "succeeded",
          needsReview: [
            {
              key: "greeting",
              reasons: ["EQUALS_SOURCE"],
              provenance: {
                origin: "machine",
                provider: "anthropic",
                model: "test-model",
                reviewState: "unreviewed",
              },
            },
          ],
        },
      ],
    });
  });

  it("drops a flag once its value is approved, rejected, or rewritten by a person", async () => {
    const dir = await translatedProject();
    await writeStatus(dir, [flagged("greeting", "farewell", "title")]);
    const base = { config: cfg(), cwd: dir, locale: "de" };
    await approveEntry({
      ...base,
      key: "greeting",
      expectedValue: await translationOf(dir, "greeting"),
    });
    await rejectEntry({
      ...base,
      key: "farewell",
      expectedValue: await translationOf(dir, "farewell"),
    });

    expect(await queuedKeys(dir)).toEqual(["title"]);

    await editEntry({ ...base, key: "title", value: "Titel" });

    expect(await queuedKeys(dir)).toEqual([]);
  });

  it("keeps a flag whose value an agent rewrote", async () => {
    const dir = await translatedProject();
    await writeStatus(dir, [flagged("title")]);

    await editEntry({
      config: cfg(),
      cwd: dir,
      locale: "de",
      key: "title",
      value: "Titel",
      actor: "agent",
    });

    expect(await queuedKeys(dir)).toEqual(["title"]);
  });

  it("brings an approval back when the source it was given against changed", async () => {
    const dir = await translatedProject();
    await writeStatus(dir, [flagged("greeting")]);
    await approveEntry({
      config: cfg(),
      cwd: dir,
      locale: "de",
      key: "greeting",
      expectedValue: await translationOf(dir, "greeting"),
    });
    const lock = (await readJsonFile(join(dir, "verbatra.lock.json"))) as {
      locales: { de: Record<string, string> };
    };
    await writeJsonFile(join(dir, "verbatra.lock.json"), {
      version: 1,
      locales: { de: { ...lock.locales.de, greeting: "another-source-hash" } },
    });

    expect(await queuedKeys(dir)).toEqual(["greeting"]);
  });

  it("narrows the fuzzy-hit evidence to the flags it keeps", async () => {
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
    await approveEntry({
      config: cfg(),
      cwd: dir,
      locale: "de",
      key: "title",
      expectedValue: await translationOf(dir, "title"),
    });

    const queue = await reviewQueue({ config: cfg(), cwd: dir });

    expect(queue.available && queue.locales[0]?.fuzzyHits).toEqual([
      { key: "greeting", previousSource: "Hi", similarity: 0.9 },
    ]);
  });

  it("drops the fuzzy-hit evidence entirely once none of its flags is left", async () => {
    const dir = await translatedProject();
    await writeStatus(dir, [
      {
        ...flagged("title"),
        fuzzyHits: [{ key: "title", previousSource: "Titles", similarity: 0.9 }],
      },
    ]);
    await approveEntry({
      config: cfg(),
      cwd: dir,
      locale: "de",
      key: "title",
      expectedValue: await translationOf(dir, "title"),
    });

    const queue = await reviewQueue({ config: cfg(), cwd: dir });

    expect(queue.available && queue.locales[0]).toEqual({
      locale: "de",
      status: "succeeded",
      needsReview: [],
    });
  });

  it("keeps every present flag, without provenance, when the provenance file is corrupt", async () => {
    const dir = await translatedProject();
    await writeStatus(dir, [flagged("greeting", "gone")]);
    await writeFile(join(dir, PROVENANCE_FILE_NAME), "{ not json", "utf8");

    const queue = await reviewQueue({ config: cfg(), cwd: dir });

    expect(queue.available && queue.locales[0]?.needsReview).toEqual([
      { key: "greeting", reasons: ["EQUALS_SOURCE"] },
    ]);
  });

  it("still narrows by review state when the lock file is corrupt", async () => {
    const dir = await translatedProject();
    await writeStatus(dir, [flagged("greeting", "title")]);
    await approveEntry({
      config: cfg(),
      cwd: dir,
      locale: "de",
      key: "greeting",
      expectedValue: await translationOf(dir, "greeting"),
    });
    await writeFile(join(dir, "verbatra.lock.json"), "{ not json", "utf8");

    expect(await queuedKeys(dir)).toEqual(["title"]);
  });

  it("keeps a locale's flags as recorded when the locale is not configured or its file is unreadable", async () => {
    const dir = await translatedProject();
    await writeStatus(dir, [
      flagged("greeting"),
      { locale: "fr", status: "succeeded", needsReview: [{ key: "x", reasons: [] }] },
    ]);
    await writeFile(join(dir, "locales", "de.json"), "{ not json", "utf8");

    expect(await queuedKeys(dir)).toEqual(["greeting", "x"]);
  });

  it("keeps a locale's flags as recorded when the configured format has no adapter", async () => {
    const dir = await translatedProject();
    await writeStatus(dir, [flagged("greeting")]);

    expect(await queuedKeys(dir, cfg({ format: "custom:missing" }))).toEqual(["greeting"]);
  });

  it("keeps the flags without provenance when the provenance file cannot be read at all", async () => {
    const dir = await translatedProject();
    await writeStatus(dir, [flagged("greeting")]);
    const fs: SdkFs = {
      ...defaultFs,
      readFileBounded: async (path, max) => {
        if (path.endsWith(PROVENANCE_FILE_NAME) || path.endsWith("verbatra.lock.json")) {
          throw new Error("EIO");
        }
        return defaultFs.readFileBounded(path, max);
      },
    };

    const queue = await reviewQueue({ config: cfg(), cwd: dir }, { fs });

    expect(queue.available && queue.locales[0]?.needsReview).toEqual([
      { key: "greeting", reasons: ["EQUALS_SOURCE"] },
    ]);
  });
});
