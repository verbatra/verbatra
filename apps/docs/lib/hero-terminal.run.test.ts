import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { check, translate } from "@verbatra/sdk";
import { afterEach, describe, expect, it } from "vitest";
import {
  HERO_CHECK_BADGE,
  HERO_CHECK_EXIT_CODE,
  HERO_CHECK_OUTPUT,
  HERO_TERMINAL_CHANGED_KEYS,
  HERO_TERMINAL_LOCALES,
  HERO_TERMINAL_SCRIPT,
  HERO_TERMINAL_SOURCE,
  HERO_TRANSLATE_EXIT_CODE,
  HERO_TRANSLATE_OUTPUT,
} from "@/lib/hero-terminal";
import { LOCK_DEMO_HASHES, lockLines } from "@/lib/lock-demo";
import {
  fixtureConfig,
  removeProject,
  runCli,
  sourceFile,
  stubProvider,
  tempProject,
  writeConfig,
  writeSource,
} from "@/test-support/run-fixture";
import { renderCheckHuman, renderHuman } from "../../../packages/cli/src/render";

const CONFIG = fixtureConfig();

const provider = stubProvider;

let cwd: string | undefined;

let seededHashes: Record<string, string> = {};

afterEach(async () => {
  await removeProject(cwd);
  cwd = undefined;
});

type LockFile = { version: number; locales: Record<string, Record<string, string>> };

async function recordedLock(dir: string): Promise<LockFile> {
  return JSON.parse(await readFile(join(dir, "verbatra.lock.json"), "utf8"));
}

async function recordedHashes(dir: string): Promise<Record<string, string>> {
  return (await recordedLock(dir)).locales.de ?? {};
}

function expectedHashes(which: "before" | "after"): Record<string, string> {
  return Object.fromEntries(
    HERO_TERMINAL_SOURCE.map(({ key }) => [key, LOCK_DEMO_HASHES[key]?.[which]]),
  ) as Record<string, string>;
}

async function projectWithEditedKeys(): Promise<string> {
  const dir = await tempProject("verbatra-docs-hero-");
  cwd = dir;
  await writeConfig(dir, CONFIG);
  await writeSource(
    dir,
    sourceFile(({ value, before }) => before ?? value),
  );
  await translate({ config: CONFIG, cwd: dir }, { createProvider: provider() });
  seededHashes = await recordedHashes(dir);
  await writeSource(
    dir,
    sourceFile(({ value }) => value),
  );
  return dir;
}

describe("the hero terminal prints what verbatra prints", () => {
  it("prints the check lines renderCheckHuman renders for two edited source values", async () => {
    const dir = await projectWithEditedKeys();
    const summary = await check({ config: CONFIG, cwd: dir });

    expect(summary.inSync).toBe(false);
    expect(renderCheckHuman(summary).split("\n")).toEqual(HERO_CHECK_OUTPUT);
  });

  it("exits check with the code the verbatra binary returns, printing the same lines", async () => {
    const dir = await projectWithEditedKeys();
    const { code, out } = await runCli(["check", "--cwd", dir], provider());

    expect(code).toBe(HERO_CHECK_EXIT_CODE);
    expect(out).toEqual(HERO_CHECK_OUTPUT);
  });

  it("prints the translate lines renderHuman renders, sending only the edited keys", async () => {
    const dir = await projectWithEditedKeys();
    const summary = await translate({ config: CONFIG, cwd: dir }, { createProvider: provider() });

    for (const locale of summary.locales) {
      expect([...locale.translated].sort()).toEqual([...HERO_TERMINAL_CHANGED_KEYS].sort());
    }
    expect(renderHuman(summary).split("\n")).toEqual(HERO_TRANSLATE_OUTPUT);
  });

  it("exits translate with the code the verbatra binary returns, printing the same lines", async () => {
    const dir = await projectWithEditedKeys();
    const { code, out } = await runCli(["translate", "--cwd", dir], provider());

    expect(code).toBe(HERO_TRANSLATE_EXIT_CODE);
    expect(out).toEqual(HERO_TRANSLATE_OUTPUT);
  });

  it("shows the lock hashes the cli records: old ones for the seeded run, new ones after translate", async () => {
    const dir = await projectWithEditedKeys();
    expect(seededHashes).toEqual(expectedHashes("before"));
    await translate({ config: CONFIG, cwd: dir }, { createProvider: provider() });
    expect(await recordedHashes(dir)).toEqual(expectedHashes("after"));
  });

  it("renders the lock file with the version and the key order the cli writes", async () => {
    const dir = await projectWithEditedKeys();
    const lock = await recordedLock(dir);
    const rendered = lockLines();
    const versionLine = rendered.find(
      (line) => line.kind === "text" && line.text.startsWith('"version"'),
    );
    expect(versionLine).toMatchObject({ text: `"version": ${lock.version},` });
    const shownKeys = rendered.flatMap((line) => (line.kind === "entry" ? [line.key] : []));
    const written = Object.keys(lock.locales.de ?? {});
    expect(shownKeys.length).toBeGreaterThan(0);
    expect(written.filter((key) => shownKeys.includes(key))).toEqual(shownKeys);
  });

  it("builds the check badge from the badge the check output carries", () => {
    expect(HERO_CHECK_OUTPUT[1]).toContain(HERO_CHECK_BADGE);
  });

  it("holds one locale and fourteen source values, two of them edited", () => {
    expect(HERO_TERMINAL_LOCALES.map(({ locale }) => locale)).toEqual(["de"]);
    expect(HERO_TERMINAL_SOURCE).toHaveLength(14);
    expect(HERO_TERMINAL_CHANGED_KEYS).toEqual(["checkout.title", "checkout.pay"]);
    expect(HERO_TRANSLATE_OUTPUT[1]).toBe("  de: 2 translated, 12 unchanged");
  });

  it("runs check before translate", () => {
    expect(HERO_TERMINAL_SCRIPT.map((step) => step.output[0])).toEqual([
      "verbatra check",
      "verbatra translate",
    ]);
  });
});
