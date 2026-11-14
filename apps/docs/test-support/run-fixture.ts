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
import { HERO_TERMINAL_LOCALES, HERO_TERMINAL_SOURCE } from "@/lib/hero-terminal";
import { run } from "../../../packages/cli/src/run";

const PASS: PlaceholderIntegrityResult = {
  matches: true,
  missing: [],
  extra: [],
  reordered: false,
};

export const SOURCE_FILE = "locales/en.json";

export function fixtureConfig(model = "stub"): VerbatraConfig {
  return {
    sourceLocale: "en",
    targetLocales: HERO_TERMINAL_LOCALES.map(({ locale }) => locale),
    format: "next-intl-json",
    files: { pattern: "locales/{locale}.json" },
    provider: { id: "anthropic", options: { model, maxTokens: 256 } },
  };
}

export function stubProvider(
  valueFor: (key: string, value: string) => string = (_key, value) => `${value} (t)`,
): CreateProvider {
  return () => ({
    id: "stub",
    kind: "llm",
    supportsGlossary: true,
    translateBatch: async (request) => ({
      values: new Map(
        request.entries.map((entry) => [entry.key, valueFor(entry.key, entry.value)]),
      ),
      integrity: new Map(request.entries.map((entry) => [entry.key, PASS])),
    }),
  });
}

export function sourceFile(
  valueFor: (item: (typeof HERO_TERMINAL_SOURCE)[number]) => string,
): string {
  const tree: Record<string, Record<string, string>> = {};
  for (const item of HERO_TERMINAL_SOURCE) {
    const [group, leaf] = item.key.split(".") as [string, string];
    tree[group] = { ...tree[group], [leaf]: valueFor(item) };
  }
  return JSON.stringify(tree, null, 2);
}

export async function tempProject(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  await mkdir(join(dir, "locales"));
  return dir;
}

export async function removeProject(dir: string | undefined): Promise<void> {
  if (dir) await rm(dir, { recursive: true, force: true });
}

export async function readTarget(dir: string, locale: string): Promise<string> {
  return readFile(join(dir, `locales/${locale}.json`), "utf8");
}

export async function writeSource(dir: string, content: string): Promise<void> {
  await writeFile(join(dir, SOURCE_FILE), content);
}

export async function writeConfig(dir: string, config: VerbatraConfig): Promise<void> {
  await writeFile(join(dir, ".verbatrarc.json"), JSON.stringify(config));
}

const unused = async (): Promise<never> => {
  throw new Error("the landing fixtures call only check and translate");
};

export async function runCli(
  argv: ReadonlyArray<string>,
  createProvider: CreateProvider,
): Promise<{ code: number; out: string[]; err: string }> {
  const out: string[] = [];
  const err: string[] = [];
  const code = await run(
    [...argv],
    {
      translate: (input) => translate(input, { createProvider }),
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
