import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { VerbatraConfig } from "../config/schema.js";
import { PROVENANCE_FILE_NAME } from "../lock/provenance-file.js";
import { baseConfig, makeTempDir, writeJsonFile } from "../test-support.js";
import { type ProvenanceReportPageResult, provenanceReportPage } from "./provenance-report-page.js";

const cfg = (): VerbatraConfig =>
  baseConfig({ targetLocales: ["de", "fr"], format: "i18next-json" });

const SOURCE = { a: "A", b: "B", c: "C" };

async function project(): Promise<string> {
  const dir = await makeTempDir();
  await mkdir(join(dir, "locales"));
  await writeJsonFile(join(dir, "locales", "en.json"), SOURCE);
  await writeJsonFile(join(dir, "locales", "de.json"), { a: "Ad", b: "Bd", c: "Cd" });
  await writeJsonFile(join(dir, "locales", "fr.json"), { a: "Af" });
  return dir;
}

function keysOf(result: ProvenanceReportPageResult): string[] {
  if (!result.available) {
    throw new Error("expected a report");
  }
  return result.locales.flatMap((locale) =>
    (locale.entries ?? []).map((entry) => `${locale.locale}:${entry.key}`),
  );
}

describe("provenanceReportPage", () => {
  it("walks every entry once and keeps every locale's counts on every page", async () => {
    const dir = await project();
    const seen: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await provenanceReportPage({
        config: cfg(),
        cwd: dir,
        limit: 2,
        ...(cursor !== undefined ? { cursor } : {}),
      });
      if (!page.available) {
        throw new Error("expected a report");
      }
      expect(page.locales.map((locale) => [locale.locale, locale.total])).toEqual([
        ["de", 3],
        ["fr", 1],
      ]);
      seen.push(...keysOf(page));
      cursor = page.nextCursor;
    } while (cursor !== undefined);

    expect(seen).toEqual(["de:a", "de:b", "de:c", "fr:a"]);
  });

  it("lists only the entries in the requested buckets, whatever their order", async () => {
    const dir = await project();

    const page = await provenanceReportPage({
      config: cfg(),
      cwd: dir,
      locales: ["fr"],
      buckets: ["unrecorded", "human", "unrecorded"],
    });

    expect(keysOf(page)).toEqual(["fr:a"]);
    expect(
      keysOf(await provenanceReportPage({ config: cfg(), cwd: dir, buckets: ["human"] })),
    ).toEqual([]);
  });

  it("refuses a cursor made under other buckets", async () => {
    const dir = await project();
    const first = await provenanceReportPage({ config: cfg(), cwd: dir, limit: 1 });
    const cursor = first.available ? first.nextCursor : undefined;

    await expect(
      provenanceReportPage({
        config: cfg(),
        cwd: dir,
        limit: 1,
        buckets: ["unrecorded"],
        ...(cursor !== undefined ? { cursor } : {}),
      }),
    ).rejects.toMatchObject({ code: "PAGE_CURSOR_INVALID" });
  });

  it("refuses a limit outside the accepted range", async () => {
    const dir = await project();

    await expect(provenanceReportPage({ config: cfg(), cwd: dir, limit: 0 })).rejects.toMatchObject(
      { code: "PAGE_LIMIT_INVALID" },
    );
  });

  it("is unavailable, not empty, when the provenance file cannot be read", async () => {
    const dir = await project();
    await writeFile(join(dir, PROVENANCE_FILE_NAME), "{ not json", "utf8");

    expect(await provenanceReportPage({ config: cfg(), cwd: dir })).toEqual({
      available: false,
      reason: "provenance-unreadable",
    });
  });
});
