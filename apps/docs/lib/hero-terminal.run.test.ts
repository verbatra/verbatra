import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
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
  HERO_CHECK_EXIT_CODE,
  HERO_CHECK_OUTPUT,
  HERO_TERMINAL_LOCALES,
  HERO_TERMINAL_NEW_KEYS,
  HERO_TERMINAL_SCRIPT,
  HERO_TERMINAL_SYNCED_KEYS,
  HERO_TRANSLATE_EXIT_CODE,
  HERO_TRANSLATE_OUTPUT,
} from "@/lib/hero-terminal";
import { renderCheckHuman, renderHuman } from "../../../packages/cli/src/render";
import { run } from "../../../packages/cli/src/run";

const CONFIG: VerbatraConfig = {
  sourceLocale: "en",
  targetLocales: HERO_TERMINAL_LOCALES.map(({ locale }) => locale),
  format: "i18next-json",
  files: { pattern: "locales/{locale}.json" },
  provider: { id: "anthropic", options: { model: "stub", maxTokens: 256 } },
};

const PASS: PlaceholderIntegrityResult = {
  matches: true,
  missing: [],
  extra: [],
  reordered: false,
};

function provider(withUsage: boolean): CreateProvider {
  return () => ({
    id: "stub",
    kind: "llm",
    supportsGlossary: true,
    translateBatch: async (request) => {
      const usage = HERO_TERMINAL_LOCALES.find(
        ({ locale }) => locale === request.targetLocale,
      )?.usage;
      return {
        values: new Map(request.entries.map((entry) => [entry.key, `${entry.value} (t)`])),
        integrity: new Map(request.entries.map((entry) => [entry.key, PASS])),
        ...(withUsage && usage !== undefined ? { usage } : {}),
      };
    },
  });
}

function sourceFile(keys: ReadonlyArray<string>): string {
  const tree: Record<string, Record<string, string>> = {};
  for (const key of keys) {
    const [group, leaf] = key.split(".") as [string, string];
    tree[group] = { ...tree[group], [leaf]: `Text for ${key}` };
  }
  return JSON.stringify(tree);
}

const unused = async (): Promise<never> => {
  throw new Error("the hero terminal calls only check and translate");
};

let cwd: string | undefined;

afterEach(async () => {
  if (cwd) await rm(cwd, { recursive: true, force: true });
  cwd = undefined;
});

async function projectWithNewKeys(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "verbatra-docs-hero-"));
  cwd = dir;
  await mkdir(join(dir, "locales"));
  await writeFile(join(dir, ".verbatrarc.json"), JSON.stringify(CONFIG));
  await writeFile(join(dir, "locales/en.json"), sourceFile(HERO_TERMINAL_SYNCED_KEYS));
  await translate({ config: CONFIG, cwd: dir }, { createProvider: provider(false) });
  await writeFile(
    join(dir, "locales/en.json"),
    sourceFile([...HERO_TERMINAL_SYNCED_KEYS, ...HERO_TERMINAL_NEW_KEYS]),
  );
  return dir;
}

async function runCli(argv: ReadonlyArray<string>): Promise<{ code: number; out: string[] }> {
  const out: string[] = [];
  const code = await run(
    [...argv],
    {
      translate: (input) => translate(input, { createProvider: provider(true) }),
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
  it("prints the check lines renderCheckHuman renders for two new source keys", async () => {
    const dir = await projectWithNewKeys();
    const summary = await check({ config: CONFIG, cwd: dir });

    expect(summary.inSync).toBe(false);
    expect(renderCheckHuman(summary).split("\n")).toEqual(HERO_CHECK_OUTPUT);
  });

  it("exits check with the code the verbatra binary returns, printing the same lines", async () => {
    const dir = await projectWithNewKeys();
    const { code, out } = await runCli(["check", "--cwd", dir]);

    expect(code).toBe(HERO_CHECK_EXIT_CODE);
    expect(out).toEqual(HERO_CHECK_OUTPUT);
  });

  it("prints the translate lines renderHuman renders, sending only the new keys", async () => {
    const dir = await projectWithNewKeys();
    const summary = await translate(
      { config: CONFIG, cwd: dir },
      { createProvider: provider(true) },
    );

    for (const locale of summary.locales) {
      expect([...locale.translated].sort()).toEqual([...HERO_TERMINAL_NEW_KEYS].sort());
    }
    expect(renderHuman(summary).split("\n")).toEqual(HERO_TRANSLATE_OUTPUT);
  });

  it("exits translate with the code the verbatra binary returns, printing the same lines", async () => {
    const dir = await projectWithNewKeys();
    const { code, out } = await runCli(["translate", "--cwd", dir]);

    expect(code).toBe(HERO_TRANSLATE_EXIT_CODE);
    expect(out).toEqual(HERO_TRANSLATE_OUTPUT);
  });

  it("runs check before translate", () => {
    expect(HERO_TERMINAL_SCRIPT.map((step) => step.output[0])).toEqual([
      "verbatra check",
      "verbatra translate",
    ]);
  });
});
