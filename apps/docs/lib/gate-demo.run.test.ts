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
  GATE_CANDIDATE_LINES,
  GATE_CHECK_COMMAND,
  GATE_CHECK_EXIT_CODE,
  GATE_CHECK_HEADER,
  GATE_CHECK_LINES,
  GATE_DE_CANDIDATE,
  GATE_DE_OLD,
  GATE_KEY,
  GATE_PLACEHOLDER,
  GATE_REFUSED_BADGE,
  GATE_REFUSED_LINES,
  GATE_SOURCE,
  GATE_SOURCE_BEFORE,
  GATE_TRANSLATE_COMMAND,
  GATE_TRANSLATE_EXIT_CODE,
  GATE_TRANSLATE_HEADER,
} from "@/lib/gate-demo";
import { HERO_TERMINAL_LOCALES, HERO_TERMINAL_SOURCE } from "@/lib/hero-terminal";
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

type Phase = "seed" | "edited";

function provider(phase: () => Phase): CreateProvider {
  return () => ({
    id: "stub",
    kind: "llm",
    supportsGlossary: true,
    translateBatch: async (request) => ({
      values: new Map(
        request.entries.map((entry) => [
          entry.key,
          entry.key === GATE_KEY
            ? phase() === "seed"
              ? GATE_DE_OLD
              : GATE_DE_CANDIDATE
            : `${entry.value} (t)`,
        ]),
      ),
      integrity: new Map(request.entries.map((entry) => [entry.key, PASS])),
    }),
  });
}

function sourceFile(edited: boolean): string {
  const tree: Record<string, Record<string, string>> = {};
  for (const { key, value } of HERO_TERMINAL_SOURCE) {
    const [group, leaf] = key.split(".") as [string, string];
    tree[group] = {
      ...tree[group],
      [leaf]: key === GATE_KEY && !edited ? GATE_SOURCE_BEFORE : value,
    };
  }
  return JSON.stringify(tree, null, 2);
}

const unused = async (): Promise<never> => {
  throw new Error("the gate demo calls only check and translate");
};

let cwd: string | undefined;
let phase: Phase = "seed";

afterEach(async () => {
  if (cwd) await rm(cwd, { recursive: true, force: true });
  cwd = undefined;
});

async function refusedProject(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "verbatra-docs-gate-"));
  cwd = dir;
  phase = "seed";
  await mkdir(join(dir, "locales"));
  await writeFile(join(dir, ".verbatrarc.json"), JSON.stringify(CONFIG));
  await writeFile(join(dir, "locales/en.json"), sourceFile(false));
  await translate({ config: CONFIG, cwd: dir }, { createProvider: provider(() => phase) });
  await writeFile(join(dir, "locales/en.json"), sourceFile(true));
  phase = "edited";
  return dir;
}

async function runCli(
  argv: ReadonlyArray<string>,
): Promise<{ code: number; out: string[]; err: string }> {
  const out: string[] = [];
  const err: string[] = [];
  const code = await run(
    [...argv],
    {
      translate: (input) => translate(input, { createProvider: provider(() => phase) }),
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
    { out: (text) => out.push(text), err: (text) => err.push(text) },
  );
  return { code, out: out.join("").trimEnd().split("\n"), err: err.join("") };
}

async function writtenGerman(dir: string): Promise<string | undefined> {
  const [group, leaf] = GATE_KEY.split(".") as [string, string];
  const file = JSON.parse(await readFile(join(dir, "locales/de.json"), "utf8")) as Record<
    string,
    Record<string, string>
  >;
  return file[group]?.[leaf];
}

describe("the gate demo prints what verbatra prints after a refusal", () => {
  it("edits one source value that carries a placeholder, the key the hero fixture already holds", () => {
    expect(GATE_SOURCE).toBe(HERO_TERMINAL_SOURCE.find(({ key }) => key === GATE_KEY)?.value);
    expect(GATE_SOURCE).toContain(GATE_PLACEHOLDER);
    expect(GATE_SOURCE_BEFORE).toContain(GATE_PLACEHOLDER);
    expect(GATE_SOURCE_BEFORE).not.toBe(GATE_SOURCE);
  });

  it("holds a candidate that dropped the placeholder and an old value that kept it", () => {
    expect(GATE_DE_OLD).toContain(GATE_PLACEHOLDER);
    expect(GATE_DE_CANDIDATE).not.toContain(GATE_PLACEHOLDER);
  });

  it("refuses the candidate and prints the lines renderHuman renders", async () => {
    const dir = await refusedProject();
    const summary = await translate(
      { config: CONFIG, cwd: dir },
      { createProvider: provider(() => phase) },
    );
    const [locale] = summary.locales;

    expect(locale?.translated).toEqual([]);
    expect(locale?.integrityRefusals).toEqual([
      { key: GATE_KEY, reason: "placeholder", details: [`-${GATE_PLACEHOLDER}`] },
    ]);
    expect(renderHuman(summary).split("\n")).toEqual([
      GATE_TRANSLATE_HEADER,
      ...GATE_REFUSED_LINES,
    ]);
  });

  it("exits translate with the code the binary returns, printing the same lines", async () => {
    const dir = await refusedProject();
    const { code, out } = await runCli(["translate", "--cwd", dir]);

    expect(code).toBe(GATE_TRANSLATE_EXIT_CODE);
    expect(out).toEqual([GATE_TRANSLATE_HEADER, ...GATE_REFUSED_LINES]);
  });

  it("badges the refusal with the count the translate line carries", async () => {
    expect(GATE_REFUSED_LINES[0]).toContain(GATE_REFUSED_BADGE);
  });

  it("does not write the refused candidate: the old value stays in the target file", async () => {
    const dir = await refusedProject();
    expect(await writtenGerman(dir)).toBe(GATE_DE_OLD);
    await runCli(["translate", "--cwd", dir]);
    expect(await writtenGerman(dir)).toBe(GATE_DE_OLD);
  });

  it("keeps the key stale: check prints the lines and the exit code the binary returns", async () => {
    const dir = await refusedProject();
    await runCli(["translate", "--cwd", dir]);
    const summary = await check({ config: CONFIG, cwd: dir });
    const { code, out } = await runCli(["check", "--cwd", dir]);

    expect(summary.inSync).toBe(false);
    expect(renderCheckHuman(summary).split("\n")).toEqual([GATE_CHECK_HEADER, ...GATE_CHECK_LINES]);
    expect(code).toBe(GATE_CHECK_EXIT_CODE);
    expect(out).toEqual([GATE_CHECK_HEADER, ...GATE_CHECK_LINES]);
  });

  it("shows the candidate card with the command line it quotes", () => {
    expect(GATE_CANDIDATE_LINES).toEqual([GATE_KEY, GATE_SOURCE, GATE_DE_CANDIDATE]);
    expect(GATE_TRANSLATE_COMMAND).toBe("npx @verbatra/cli translate");
    expect(GATE_CHECK_COMMAND).toBe("npx @verbatra/cli check");
  });
});
