import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type CreateProvider,
  check,
  loadConfigWithMeta,
  type PlaceholderIntegrityResult,
  translate,
  type VerbatraConfig,
} from "@verbatra/sdk";
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
import { renderCheckHuman, renderHuman } from "../../../packages/cli/src/render";
import { run } from "../../../packages/cli/src/run";

const CONFIG: VerbatraConfig = {
  sourceLocale: "en",
  targetLocales: HERO_TERMINAL_LOCALES.map(({ locale }) => locale),
  format: "next-intl-json",
  files: { pattern: "locales/{locale}.json" },
  provider: { id: "anthropic", options: { model: "stub", maxTokens: 256 } },
};

const PASS: PlaceholderIntegrityResult = {
  matches: true,
  missing: [],
  extra: [],
  reordered: false,
};

function provider(): CreateProvider {
  return () => ({
    id: "stub",
    kind: "llm",
    supportsGlossary: true,
    translateBatch: async (request) => ({
      values: new Map(request.entries.map((entry) => [entry.key, `${entry.value} (t)`])),
      integrity: new Map(request.entries.map((entry) => [entry.key, PASS])),
    }),
  });
}

function sourceFile(edited: boolean): string {
  const tree: Record<string, Record<string, string>> = {};
  for (const { key, value, before } of HERO_TERMINAL_SOURCE) {
    const [group, leaf] = key.split(".") as [string, string];
    tree[group] = { ...tree[group], [leaf]: edited ? value : (before ?? value) };
  }
  return JSON.stringify(tree, null, 2);
}

const unused = async (): Promise<never> => {
  throw new Error("the hero terminal calls only check and translate");
};

let cwd: string | undefined;

let seededHashes: Record<string, string> = {};

afterEach(async () => {
  if (cwd) await rm(cwd, { recursive: true, force: true });
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
  const dir = await mkdtemp(join(tmpdir(), "verbatra-docs-hero-"));
  cwd = dir;
  await mkdir(join(dir, "locales"));
  await writeFile(join(dir, ".verbatrarc.json"), JSON.stringify(CONFIG));
  await writeFile(join(dir, "locales/en.json"), sourceFile(false));
  await translate({ config: CONFIG, cwd: dir }, { createProvider: provider() });
  seededHashes = await recordedHashes(dir);
  await writeFile(join(dir, "locales/en.json"), sourceFile(true));
  return dir;
}

async function runCli(argv: ReadonlyArray<string>): Promise<{ code: number; out: string[] }> {
  const out: string[] = [];
  const code = await run(
    [...argv],
    {
      translate: (input) => translate(input, { createProvider: provider() }),
      watch: unused,
      exportWorkbook: unused,
      importWorkbook: unused,
      check,
      checkFile: unused,
      diff: unused,
      doctor: unused,
      loadConfigWithMeta,
      pseudolocalize: unused,
      importStudio: unused,
      importMcp: unused,
      extract: unused,
      generateTypes: unused,
      importTmx: unused,
      exportTmx: unused,
      provenanceReport: unused,
    },
    { out: (text) => out.push(text), err: () => undefined },
  );
  return { code, out: out.join("").trimEnd().split("\n") };
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
    const { code, out } = await runCli(["check", "--cwd", dir]);

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
    const { code, out } = await runCli(["translate", "--cwd", dir]);

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
