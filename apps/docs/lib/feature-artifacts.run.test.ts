import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type CreateProvider,
  check,
  doctor,
  exportWorkbook,
  extract,
  generateTypes,
  loadConfigWithMeta,
  type PlaceholderIntegrityResult,
  translate,
  type VerbatraConfig,
  watch,
} from "@verbatra/sdk";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type ArtifactLine,
  DOCTOR_OUTPUT,
  DRY_RUN_OUTPUT,
  EXPORT_COLUMNS,
  EXPORT_DIRECTORY,
  EXPORT_OUTPUT,
  EXPORT_ROWS,
  EXTRACT_OUTPUT,
  FEATURE_ARTIFACTS,
  FEATURE_SOURCE_CODE,
  FEATURE_SOURCE_PATH,
  TYPES_DECLARATIONS,
  TYPES_FILE,
  TYPES_OUTPUT,
  WATCH_OUTPUT,
} from "@/lib/feature-artifacts";
import { HERO_TERMINAL_LOCALES, HERO_TERMINAL_SOURCE } from "@/lib/hero-terminal";
import { LANDING_FEATURES } from "@/lib/landing-features";
import { PLAYGROUND_FILES_PATTERN, PLAYGROUND_SOURCE_LOCALE } from "@/lib/landing-playground";
import { run } from "../../../packages/cli/src/run";
import type { Session } from "../../../packages/cli/src/types";
import { WAITING_FOR_CHANGES } from "../../../packages/cli/src/watch-session";

const CONFIG: VerbatraConfig = {
  sourceLocale: PLAYGROUND_SOURCE_LOCALE,
  targetLocales: HERO_TERMINAL_LOCALES.map(({ locale }) => locale),
  format: "next-intl-json",
  files: { pattern: PLAYGROUND_FILES_PATTERN },
  provider: { id: "gemini", options: { model: "gemini-2.5-flash", maxOutputTokens: 4096 } },
  extract: { framework: "i18next", roots: ["src"] },
};

const SOURCE_FILE = PLAYGROUND_FILES_PATTERN.replace("{locale}", PLAYGROUND_SOURCE_LOCALE);

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
  throw new Error("the feature deck calls only extract, types, doctor, translate, watch, export");
};

let cwd: string | undefined;
let providerKey: string | undefined;

beforeEach(() => {
  providerKey = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
});

afterEach(async () => {
  if (providerKey !== undefined) process.env.GEMINI_API_KEY = providerKey;
  if (cwd) await rm(cwd, { recursive: true, force: true });
  cwd = undefined;
});

async function projectWithEditedKeys(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "verbatra-docs-features-"));
  cwd = dir;
  await mkdir(join(dir, "messages"));
  await mkdir(join(dir, "src"));
  await writeFile(join(dir, ".verbatrarc.json"), JSON.stringify(CONFIG));
  await writeFile(join(dir, SOURCE_FILE), sourceFile(false));
  await writeFile(join(dir, FEATURE_SOURCE_PATH), FEATURE_SOURCE_CODE);
  await translate({ config: CONFIG, cwd: dir }, { createProvider: provider() });
  await writeFile(join(dir, SOURCE_FILE), sourceFile(true));
  return dir;
}

async function runCli(
  dir: string,
  argv: ReadonlyArray<string>,
): Promise<{ code: number; out: string[]; all: string[] }> {
  const out: string[] = [];
  const all: string[] = [];
  let session: Session | undefined;
  const code = await run(
    [...argv, "--cwd", dir],
    {
      translate: (input) => translate(input, { createProvider: provider() }),
      watch: (input) => watch(input, { createProvider: provider() }),
      exportWorkbook,
      importWorkbook: unused,
      check,
      checkFile: unused,
      diff: unused,
      doctor,
      loadConfigWithMeta,
      pseudolocalize: unused,
      importStudio: unused,
      importMcp: unused,
      extract,
      generateTypes,
      importTmx: unused,
      exportTmx: unused,
      provenanceReport: unused,
    },
    {
      out: (text) => {
        out.push(text);
        all.push(text);
      },
      err: (text) => {
        all.push(text);
        if (text.includes(WAITING_FOR_CHANGES)) session?.requestStop();
      },
    },
    {
      onWatchSession: (started) => {
        session = started;
      },
    },
  );
  const lines = (chunks: string[]) =>
    chunks.join("").replaceAll(`${dir}/`, "").trimEnd().split("\n");
  return { code, out: lines(out), all: lines(all) };
}

function texts(lines: ReadonlyArray<ArtifactLine>): string[] {
  return lines.flatMap((line) => (line.kind === "output" ? [line.text] : []));
}

describe("the feature deck prints what verbatra prints", () => {
  it("prints the extract dry run over a source file with two new call sites", async () => {
    const dir = await projectWithEditedKeys();
    const { code, out } = await runCli(dir, ["extract", "--dry-run"]);
    expect(code).toBe(0);
    expect(out).toEqual(texts(EXTRACT_OUTPUT));
  });

  it("prints the types run and declares the keys as the generated file does", async () => {
    const dir = await projectWithEditedKeys();
    const { code, out } = await runCli(dir, ["types"]);
    expect(code).toBe(0);
    expect(out).toEqual(texts(TYPES_OUTPUT));
    const written = (await readFile(join(dir, TYPES_FILE), "utf8")).split("\n");
    const from = written.indexOf("export interface VerbatraMessages {");
    const to = written.indexOf("}", from);
    expect(written.slice(from + 1, to)).toEqual(TYPES_DECLARATIONS.map(({ text }) => text));
    expect(TYPES_DECLARATIONS.filter(({ shown }) => shown)).toHaveLength(3);
  });

  it("prints doctor verbatim up to one fold, which hides only checks that passed", async () => {
    const dir = await projectWithEditedKeys();
    const { code, out } = await runCli(dir, ["doctor"]);
    expect(code).toBe(1);
    const fold = DOCTOR_OUTPUT.findIndex((line) => line.kind === "moreChecks");
    const head = texts(DOCTOR_OUTPUT.slice(0, fold));
    const tail = texts(DOCTOR_OUTPUT.slice(fold + 1));
    expect(out.slice(0, head.length)).toEqual(head);
    expect(out.slice(out.length - tail.length)).toEqual(tail);
    const folded = out.slice(head.length, out.length - tail.length);
    expect(folded.length).toBeGreaterThan(0);
    for (const line of folded) expect(line).toMatch(/^ {2}\[ok {2}\] /);
  });

  it("prints the translate dry run", async () => {
    const dir = await projectWithEditedKeys();
    const { code, out } = await runCli(dir, ["translate", "--dry-run"]);
    expect(code).toBe(0);
    expect(out).toEqual(texts(DRY_RUN_OUTPUT));
  });

  it("prints what a real watch session prints, from its banner to the waiting line", async () => {
    const dir = await projectWithEditedKeys();
    const { code, all } = await runCli(dir, ["watch"]);
    expect(code).toBe(0);
    const shown = texts(WATCH_OUTPUT);
    expect(all.slice(0, shown.length)).toEqual(shown);
  });

  it("prints the export run and shows columns and rows of the written csv", async () => {
    const dir = await projectWithEditedKeys();
    const { code, out } = await runCli(dir, ["export", "--format", "csv"]);
    expect(code).toBe(0);
    expect(out).toEqual(texts(EXPORT_OUTPUT));
    const file = FEATURE_ARTIFACTS.handoff.head;
    expect(file.startsWith(`${EXPORT_DIRECTORY}/`)).toBe(true);
    const [header = "", ...rows] = (await readFile(join(dir, file), "utf8"))
      .replace(/^\uFEFF/, "")
      .trimEnd()
      .split("\n")
      .map((line) => line.split(","));
    const at = EXPORT_COLUMNS.map((column) => header.indexOf(column));
    expect(at.every((index) => index >= 0)).toBe(true);
    expect(rows.map((row) => at.map((index) => row[index]))).toEqual(EXPORT_ROWS);
  });

  it("names a command for every feature and an artifact that opens with it", () => {
    for (const { id, command } of LANDING_FEATURES) {
      const first = FEATURE_ARTIFACTS[id].blocks[0];
      if (first?.kind !== "cli") {
        expect(id).toBe("studio");
        continue;
      }
      const opener = first.lines[0];
      expect(opener?.kind === "command" ? opener.text : "", id).toContain(
        command.replace("verbatra ", "@verbatra/cli "),
      );
    }
  });
});
