import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { VerbatraConfig } from "../config/schema.js";
import { PROVENANCE_FILE_NAME, valueHash } from "../lock/provenance-file.js";
import {
  baseConfig,
  makeStubProvider,
  makeTempDir,
  readJsonFile,
  writeJsonFile,
} from "../test-support.js";
import { approveLocale } from "./approve-locale.js";
import { check } from "./check.js";
import { editEntry } from "./edit-entry.js";
import { translate } from "./translate-project.js";

const cfg = (overrides: Partial<VerbatraConfig> = {}): VerbatraConfig =>
  baseConfig({ targetLocales: ["de", "fr"], ...overrides });

async function translatedProject(): Promise<string> {
  const dir = await makeTempDir();
  await mkdir(join(dir, "locales"));
  await writeJsonFile(join(dir, "locales", "en.json"), { greeting: "Hello", title: "Title" });
  await translate(
    { config: cfg(), cwd: dir },
    { createProvider: (provider) => makeStubProvider({ id: provider.id }).provider },
  );
  return dir;
}

describe("check: the review gate", () => {
  it("is absent unless requested", async () => {
    const dir = await translatedProject();

    const summary = await check({ config: cfg(), cwd: dir });

    expect(summary.review).toBeUndefined();
    expect(summary.locales.every((locale) => locale.review === undefined)).toBe(true);
  });

  it("fails with REVIEW_REQUIRED and lists every unapproved machine value per locale", async () => {
    const dir = await translatedProject();
    await approveLocale({ config: cfg(), cwd: dir, locale: "fr" });

    const summary = await check({ config: cfg(), cwd: dir, requireReviewed: true });

    expect(summary.inSync).toBe(true);
    expect(summary.review).toEqual({ reviewed: false, unreviewed: 2, code: "REVIEW_REQUIRED" });
    expect(summary.locales.map((locale) => [locale.locale, locale.review])).toEqual([
      ["de", { unreviewed: ["greeting", "title"] }],
      ["fr", { unreviewed: [] }],
    ]);
  });

  it("passes once every machine value is approved or rewritten by a person", async () => {
    const dir = await translatedProject();
    await approveLocale({ config: cfg(), cwd: dir, locale: "fr" });
    await approveLocale({ config: cfg(), cwd: dir, locale: "de" });
    await editEntry({ config: cfg(), cwd: dir, locale: "de", key: "title", value: "Titel" });

    const summary = await check({ config: cfg(), cwd: dir, requireReviewed: true });

    expect(summary.review).toEqual({ reviewed: true, unreviewed: 0 });
  });

  it("narrows to the requested locales", async () => {
    const dir = await translatedProject();
    await approveLocale({ config: cfg(), cwd: dir, locale: "fr" });

    const summary = await check({
      config: cfg(),
      cwd: dir,
      locales: ["fr"],
      requireReviewed: true,
    });

    expect(summary.review).toEqual({ reviewed: true, unreviewed: 0 });
  });

  it("counts a rejected value that is back in the file as not approved", async () => {
    const dir = await translatedProject();
    await approveLocale({ config: cfg(), cwd: dir, locale: "fr" });
    const values = (await readJsonFile(join(dir, "locales", "de.json"))) as Record<string, string>;
    await approveLocale({ config: cfg(), cwd: dir, locale: "de" });
    await writeJsonFile(join(dir, PROVENANCE_FILE_NAME), {
      version: 1,
      locales: {
        ...((await readJsonFile(join(dir, PROVENANCE_FILE_NAME))) as { locales: object }).locales,
        de: {
          greeting: {
            origin: "machine",
            valueHash: valueHash(values.greeting ?? ""),
            reviewState: "rejected",
          },
          title: {
            origin: "machine",
            valueHash: valueHash(values.title ?? ""),
            reviewState: "approved",
          },
        },
      },
    });

    const summary = await check({ config: cfg(), cwd: dir, requireReviewed: true });

    expect(summary.review).toEqual({ reviewed: false, unreviewed: 1, code: "REVIEW_REQUIRED" });
  });

  it("fails closed with REVIEW_STATE_UNREADABLE when the provenance file cannot be read", async () => {
    const dir = await translatedProject();
    await writeFile(join(dir, PROVENANCE_FILE_NAME), "{ not json", "utf8");

    const summary = await check({ config: cfg(), cwd: dir, requireReviewed: true });

    expect(summary.review).toEqual({
      reviewed: false,
      unreviewed: 0,
      code: "REVIEW_STATE_UNREADABLE",
    });
    expect(summary.locales[0]?.review).toEqual({ unreviewed: [] });
  });
});
