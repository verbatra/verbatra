import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { LoadedConfig } from "../config/load-config.js";
import type { VerbatraConfig } from "../config/schema.js";
import { baseConfig, makeTempDir, writeJsonFile } from "../test-support.js";
import { type DoctorResult, doctor } from "./doctor.js";

const config: VerbatraConfig = baseConfig({
  targetLocales: ["de", "pt-BR"],
  files: { pattern: "locales/{locale}.json", localeStyle: "posix" },
});

async function projectWith(files: Readonly<Record<string, unknown>>): Promise<string> {
  const dir = await makeTempDir();
  for (const [name, content] of Object.entries(files)) {
    await writeJsonFile(join(dir, name), content);
  }
  return dir;
}

const lockOf = (locales: Record<string, Record<string, string>>) => ({ version: 1, locales });

async function localeState(dir: string): Promise<DoctorResult["checks"][number] | undefined> {
  const loaded: LoadedConfig = {
    config,
    source: { kind: "override" },
    glossary: { source: "none" },
  };
  const result = await doctor({ cwd: dir }, { loadConfig: async () => loaded });
  return result.checks.find((entry) => entry.id === "locale-state");
}

describe("doctor: the locale-state check", () => {
  it("passes and says so when every locale with state is configured", async () => {
    const dir = await projectWith({ "verbatra.lock.json": lockOf({ de: { a: "h" } }) });

    expect(await localeState(dir)).toEqual({
      id: "locale-state",
      title: "Locale state",
      status: "pass",
      detail:
        "Every locale with state in verbatra.lock.json, verbatra.cache.json, and " +
        "verbatra.provenance.json is configured.",
    });
  });

  it("names an underscore spelling the next translate run will carry over", async () => {
    const dir = await projectWith({ "verbatra.lock.json": lockOf({ pt_BR: { a: "h" } }) });

    const check = await localeState(dir);

    expect(check?.status).toBe("pass");
    expect(check?.detail).toBe(
      "State recorded for locales that are not configured. verbatra.lock.json: " +
        '"pt_BR" (carried over to "pt-BR" by the next translate run). Remove the state of a ' +
        "locale you no longer translate, or respell the configured locale to match it.",
    );
  });

  it("names a locale that matches no configured code", async () => {
    const dir = await projectWith({ "verbatra.lock.json": lockOf({ fr: { a: "h" }, de: {} }) });

    expect((await localeState(dir))?.detail).toContain(
      'verbatra.lock.json: "fr" (not a configured locale).',
    );
  });

  it("names a spelling left behind because the configured code already has state", async () => {
    const dir = await projectWith({
      "verbatra.lock.json": lockOf({ pt_BR: { a: "h" }, "pt-BR": { a: "h" } }),
    });

    expect((await localeState(dir))?.detail).toContain(
      '"pt_BR" (a spelling of "pt-BR", which already has its own state)',
    );
  });

  it("names both spellings when two compete for one configured code", async () => {
    const dir = await projectWith({
      "verbatra.lock.json": lockOf({ pt_BR: { a: "h" }, pt_br: { a: "h" } }),
    });

    expect((await localeState(dir))?.detail).toContain(
      'verbatra.lock.json: "pt_BR" (one of several spellings of "pt-BR", so none is carried ' +
        'over), "pt_br" (one of several spellings of "pt-BR", so none is carried over).',
    );
  });

  it("reads the translation memory and the provenance file too", async () => {
    const dir = await projectWith({
      "verbatra.cache.json": {
        version: 2,
        entries: { fp: { pt_BR: { h: "Olá" }, fr: {} } },
        sources: {},
      },
      "verbatra.provenance.json": {
        version: 1,
        locales: { it: { a: { origin: "human", valueHash: "v" } } },
      },
    });

    const detail = (await localeState(dir))?.detail;

    expect(detail).toContain(
      'verbatra.cache.json: "pt_BR" (carried over to "pt-BR" by the next translate run).',
    );
    expect(detail).toContain('verbatra.provenance.json: "it" (not a configured locale).');
    expect(detail).not.toContain('"fr"');
  });

  it("passes with the read error when the lock file cannot be read", async () => {
    const dir = await makeTempDir();
    await writeFile(join(dir, "verbatra.lock.json"), "{ not json", "utf8");

    const check = await localeState(dir);

    expect(check?.status).toBe("pass");
    expect(check?.detail).toMatch(
      /^The locale state could not be read: The lock-file at .* is not valid JSON\.$/,
    );
  });
});
