import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  type Consumer,
  fillWorkbook,
  parseEnvelope,
  readSharedConsumer,
  runVerbatra,
  writeJsonIn,
} from "../src/harness.js";

interface ReportJson {
  available: boolean;
  reason?: string;
  generatedAt?: string;
  toolVersion?: string;
  sourceLocale?: string;
  locales?: {
    locale: string;
    total: number;
    counts: Record<string, number>;
    entries: { key: string; bucket: string; origin: string; reviewState: string }[];
  }[];
}

const config = {
  sourceLocale: "en",
  targetLocales: ["de", "fr"],
  format: "i18next-json",
  files: { pattern: "locales/{locale}.json" },
  provider: { id: "none", options: {} },
};

let consumer: Consumer;

beforeAll(async () => {
  consumer = await readSharedConsumer();
}, 180_000);

async function importedProject(name: string): Promise<string> {
  const dir = join(consumer.dir, name);
  await mkdir(dir, { recursive: true });
  await writeJsonIn(dir, ".verbatrarc.json", config);
  await writeJsonIn(dir, "locales/en.json", { greeting: "Hello", farewell: "Bye", title: "Title" });
  const workbookPath = join(dir, "handoff.xlsx");
  const run = (args: string[]) => runVerbatra(consumer, [...args, "--cwd", dir]);
  expect((await run(["export", "--out", workbookPath])).exitCode).toBe(0);
  await fillWorkbook(workbookPath, (key) => `${key} (de)`);
  expect((await run(["import", workbookPath])).exitCode).toBe(0);
  const de = JSON.parse(await readFile(join(dir, "locales", "de.json"), "utf8")) as Record<
    string,
    string
  >;
  await writeJsonIn(dir, "locales/de.json", { ...de, farewell: "Ciao" });
  const provenancePath = join(dir, "verbatra.provenance.json");
  const provenance = JSON.parse(await readFile(provenancePath, "utf8")) as {
    locales: Record<string, Record<string, unknown>>;
  };
  delete provenance.locales.de?.title;
  await writeJsonIn(dir, "verbatra.provenance.json", provenance);
  return dir;
}

describe("report provenance (keyless)", () => {
  it("prints the JSON report per locale and writes nothing", async () => {
    const dir = await importedProject("report-provenance");
    const before = await readdir(dir, { recursive: true });

    const reported = await runVerbatra(consumer, [
      "report",
      "provenance",
      "--json",
      "--locales",
      "de",
      "--cwd",
      dir,
    ]);

    expect(reported.exitCode).toBe(0);
    const envelope = parseEnvelope<ReportJson>(reported.stdout);
    expect(envelope.ok).toBe(true);
    const result = envelope.ok ? envelope.result : undefined;
    expect(result).toMatchObject({ available: true, sourceLocale: "en" });
    expect(result?.toolVersion).toMatch(/^\d+\.\d+\.\d+/);
    expect(Number.isNaN(Date.parse(result?.generatedAt ?? ""))).toBe(false);
    expect(result?.locales?.map((locale) => locale.locale)).toEqual(["de"]);
    expect(result?.locales?.[0]?.entries.map((entry) => [entry.key, entry.bucket])).toEqual([
      ["greeting", "import"],
      ["farewell", "external"],
      ["title", "unrecorded"],
    ]);
    expect(result?.locales?.[0]?.counts).toMatchObject({
      import: 1,
      external: 1,
      unrecorded: 1,
      "machine-unreviewed": 0,
    });
    expect(await readdir(dir, { recursive: true })).toEqual(before);
  });

  it("prints a human summary table", async () => {
    const dir = await importedProject("report-provenance-human");

    const reported = await runVerbatra(consumer, ["report", "provenance", "--cwd", dir]);

    expect(reported.exitCode).toBe(0);
    expect(reported.stdout).toContain("verbatra report provenance (source en");
    expect(reported.stdout).toMatch(/\n {2}de {6}0 +0 +0 +1 +1 +1 +0 +3\n/);
    expect(reported.stdout).toMatch(/\n {2}fr {6}0 +0 +0 +3 +0 +0 +0 +3\n/);
    expect(reported.stdout).toContain("not legal advice");
  });

  it("fails closed with exit 1 when the provenance file is corrupt", async () => {
    const dir = await importedProject("report-provenance-corrupt");
    await writeFile(join(dir, "verbatra.provenance.json"), "{ not json", "utf8");

    const reported = await runVerbatra(consumer, ["report", "provenance", "--json", "--cwd", dir]);

    expect(reported.exitCode).toBe(1);
    expect(parseEnvelope<ReportJson>(reported.stdout)).toMatchObject({
      ok: true,
      command: "report",
      result: { available: false, reason: "provenance-unreadable" },
    });
  });
});
